import { AIChatAgent } from "@cloudflare/ai-chat";
import { routeAgentRequest } from "agents";
import { createWorkersAI } from "workers-ai-provider";
import { convertToModelMessages, generateText } from "ai";


export class PotatoChatAgent extends AIChatAgent<Env> {
  async onChatMessage() {
    const workersAi = createWorkersAI({
      binding: this.env.AI,
    });
    const { text } = await generateText({
      model: workersAi("@cf/zai-org/glm-4.7-flash"),
      messages: await convertToModelMessages(this.messages),
    }) 
    return new Response(text);  
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
