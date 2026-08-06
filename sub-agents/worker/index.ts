import { AIChatAgent } from "@cloudflare/ai-chat";
import { Agent, callable, routeAgentRequest } from "agents";
import { generateText, isLoopFinished, Output, tool } from "ai";
import Cloudflare from "cloudflare";
import { createWorkersAI } from "workers-ai-provider";
import z from "zod";

const FindingSchema = z.object({
  topic: z.string().meta({
    description: "Short title summarizing what this set of findings is about.",
  }),
  keyFindings: z
    .array(
      z.string().meta({
        description: "A single concise factual statement from the research.",
      }),
    )
    .max(5)
    .meta({
      description: "3-5 distinct key facts extracted from the research text.",
    }),
});

export class Researcher extends Agent<Env> {
  makeCloudflare() {
    return new Cloudflare({
      apiToken: this.env.API_TOKEN,
    });
  }

  async research(query: string) {
    const workersAi = createWorkersAI({ binding: this.env.AI });

    const { text } = await generateText({
      model: workersAi("@cf/zai-org/glm-4.7-flash"),
      prompt: `Research this query and gather facts: ${query}`,
      tools: {
        searchWeb: tool({
          description:
            "Search the web via DuckDuckGo. Returns the SERP as markdown.",
          inputSchema: z.object({ query: z.string() }),
          execute: async ({ query }) => {
            console.log("searching for", query);
            const markdown =
              await this.makeCloudflare().browserRendering.markdown.create({
                account_id: this.env.ACCOUNT_ID,
                url: `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`,
              });
            return { ok: true, results: markdown };
          },
        }),
        readPage: tool({
          description: "Fetch a URL and return clean markdown via Browser Run.",
          inputSchema: z.object({ url: z.url() }),
          execute: async ({ url }) => {
            console.log("reading ", url);
            const markdown =
              await this.makeCloudflare().browserRendering.markdown.create({
                account_id: this.env.ACCOUNT_ID,
                url,
              });
            return { ok: true, markdown };
          },
        }),
      },
      stopWhen: isLoopFinished(),
    });

    const { output } = await generateText({
      model: workersAi("@cf/zai-org/glm-4.7-flash"),
      prompt: `Read the following research and give me relevant 3 to 5 facts.\n\nResearch:${text}`,
      stopWhen: isLoopFinished(),
      output: Output.object({
        schema: FindingSchema,
      }),
    });
    return output;
  }
}

export type Finding = z.infer<typeof FindingSchema>;

export type OrchestratorState = {
  status: "idle" | "planning";
  plan?: string[];
  findings?: Finding[];
};

export class Orchestrator extends AIChatAgent<Env, OrchestratorState> {
  initialState: OrchestratorState = {
    status: "idle",
  };

  @callable()
  async research(query: string) {
    this.setState({
      status: "planning",
    });
    const workersAi = createWorkersAI({ binding: this.env.AI });
    const {
      output: { queries },
    } = await generateText({
      model: workersAi("@cf/zai-org/glm-4.7-flash"),
      output: Output.object({
        schema: z.object({
          queries: z
            .array(
              z.string().meta({
                description:
                  "A query for a search engine, exploring an angle of research",
              }),
            )
            .min(3)
            .max(3)
            .meta({
              description:
                "Three distinct research angles. Phrased as search queries",
            }),
        }),
      }),
      prompt: `Break this topic into 3 different research angles: ${query}\nEach has to be phrased as a researc query`,
    });

    this.setState({
      ...this.state,
      plan: queries,
    });

    const outputs = await Promise.all(
      queries.map(async (query, index) => {
        const stubAgent = await this.subAgent(
          Researcher,
          `researcher-${index}`,
        );
        const result = await stubAgent.research(query);
        return result;
      }),
    );

    this.setState({ ...this.state, findings: outputs });
  }
}

export default {
	async fetch(request, env) {
		console.log('fetch', request.url);
		const agentResponse = await routeAgentRequest(request, env);
		if (agentResponse) return agentResponse;
		return new Response(null, { status: 404 });
	},
} satisfies ExportedHandler<Env>;
