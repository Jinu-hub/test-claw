import { AIChatAgent } from "@cloudflare/ai-chat";
import { callable, routeAgentRequest } from "agents";
import { generateText, Output } from "ai";
import { createWorkersAI } from "workers-ai-provider";
import z from "zod";

export type OrchestratorState = {
  status: "idle" | "planning";
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
    console.log(queries);
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
