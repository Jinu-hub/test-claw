import { AIChatAgent } from "@cloudflare/ai-chat";
import { routeAgentRequest } from "agents";
import { createWorkersAI } from "workers-ai-provider";
import {
  convertToModelMessages,
  streamText,
  type StreamTextOnFinishCallback,
  type ToolSet,
} from "ai";
import {
  buildSystemPrompt,
  createInitialState,
  type GameState,
} from "./game";

export class TwentyQuestionsAgent extends AIChatAgent<Env, GameState> {
  initialState: GameState = createInitialState();

  async onChatMessage(
    _onFinish: StreamTextOnFinishCallback<ToolSet>,
    options?: { abortSignal?: AbortSignal },
  ) {
    const workersAi = createWorkersAI({
      binding: this.env.AI,
    });

    const result = streamText({
      model: workersAi("@cf/zai-org/glm-4.7-flash"),
      system: buildSystemPrompt(this.state.secret, this.state.category),
      messages: await convertToModelMessages(this.messages),
      abortSignal: options?.abortSignal,
      providerOptions: {
        "workers-ai": {
          enable_thinking: false,
        },
      },
    });

    return result.toUIMessageStreamResponse({ sendReasoning: false });
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
