import { AIChatAgent } from "@cloudflare/ai-chat";
import { routeAgentRequest } from "agents";
import { createBrowserTools } from "agents/browser/ai";
import { convertToModelMessages, isLoopFinished, streamText } from "ai";
import { createWorkersAI } from "workers-ai-provider";


export class BrowserAgent extends AIChatAgent<Env> {
  async onChatMessage() {
    const workersAi = createWorkersAI({ binding: this.env.AI });

    const browserTools = createBrowserTools({
      browser: this.env.BROWSER as unknown as Fetcher,
      loader: this.env.LOADER,
    });

    const result = streamText({
      model: workersAi("@cf/zai-org/glm-4.7-flash"),
      system: "You can browse the web and inspect pages.",
      messages: await convertToModelMessages(this.messages),
      tools: {
        ...browserTools,
      },
      stopWhen: isLoopFinished(),
    });

    return result.toUIMessageStreamResponse();
  }
}

export default {
  async fetch(request, env) {
    return (
      (await routeAgentRequest(request, env)) ??
      new Response(null, { status: 404 })
    );
  },
} satisfies ExportedHandler<Env>;