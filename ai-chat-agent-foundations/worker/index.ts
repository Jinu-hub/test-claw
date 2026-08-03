import { AIChatAgent } from "@cloudflare/ai-chat";
import { routeAgentRequest } from "agents";
import { createWorkersAI } from "workers-ai-provider";
import {
  convertToModelMessages,
  isLoopFinished,
  streamText,
  type StreamTextOnFinishCallback,
  type ToolSet,
  type UIMessage
} from "ai";
import { getWeather, getLocation, buyPlaneTicket, getTickets } from "./tools";

export class PotatoChatAgent extends AIChatAgent<Env> {
  async onChatMessage(
    _onFinish: StreamTextOnFinishCallback<ToolSet>,
    options?: { abortSignal?: AbortSignal },
  ) {
    const workersAi = createWorkersAI({
      binding: this.env.AI,
    });
    const textStream = await streamText({
      model: workersAi("@cf/zai-org/glm-4.7-flash"),
      messages: await convertToModelMessages(this.messages),
      tools: {
        getWeather,
        getLocation,
        getTickets,
        buyPlaneTicket,
      },
      abortSignal: options?.abortSignal,
      stopWhen: isLoopFinished(),
    }) 
    return textStream.toUIMessageStreamResponse(); 
  }

  sanitizeMessageForPersistence(message: UIMessage): UIMessage {
    return {
      ...message,
      parts: message.parts.map((part) => {
        if (part.type === "text") {
          return {
            ...part,
            text: part.text.replace("food", "❌ stop eating u fat ❌"),
          };
        }
        return part;
      }),
    };
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
