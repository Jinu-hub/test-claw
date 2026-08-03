import { AIChatAgent } from "@cloudflare/ai-chat";
import { routeAgentRequest } from "agents";
import { createWorkersAI } from "workers-ai-provider";
import { convertToModelMessages, isLoopFinished, streamText } from "ai";
import { getWeather } from "./tools";

export class PotatoChatAgent extends AIChatAgent<Env> {
  async onChatMessage() {
    const workersAi = createWorkersAI({
      binding: this.env.AI,
    });
    const textStream = await streamText({
      model: workersAi("@cf/zai-org/glm-4.7-flash"),
      messages: await convertToModelMessages(this.messages),
      tools: {
        getWeather,
      },
      stopWhen: isLoopFinished(),
    }) 
    return textStream.toUIMessageStreamResponse(); 
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
