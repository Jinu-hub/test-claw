import { AIChatAgent } from "@cloudflare/ai-chat";
import { routeAgentRequest } from "agents";
import {
  streamText,
  convertToModelMessages,
  stepCountIs,
  type StreamTextOnFinishCallback,
  type ToolSet,
  wrapLanguageModel,
  type LanguageModelMiddleware,
  type UIMessage,
} from "ai";
import { createWorkersAI } from "workers-ai-provider";

const logMiddleware: LanguageModelMiddleware = {
  specificationVersion: "v3",
  transformParams: async ({ type, params }) => {
    console.log(`${type}: message count is ${params.prompt.length}`);
    return params;
  },
};

const upperCaseMiddlware: LanguageModelMiddleware = {
  specificationVersion: "v3",
  wrapStream: async ({ doStream }) => {
    const { stream, ...rest } = await doStream();
    const transformed = stream.pipeThrough(
      new TransformStream({
        transform: (chunk, controller) => {
          if (chunk.type === "text-delta") {
            controller.enqueue({ ...chunk, delta: chunk.delta.toUpperCase() });
          } else {
            controller.enqueue(chunk);
          }
        },
      }),
    );
    return { ...rest, stream: transformed };
  },
};

const _upperCaseMiddlware: LanguageModelMiddleware = {
  specificationVersion: "v3",
  wrapGenerate: async ({ doGenerate }) => {
    const result = await doGenerate();
    return {
      ...result,
      content: result.content.map((part) =>
        part.type === "text"
          ? {
              ...part,
              text: part.text.toUpperCase(),
            }
          : part,
      ),
    };
  },
};

export class ChatAgent extends AIChatAgent<Env> {
  async onChatMessage(
    onFinish: StreamTextOnFinishCallback<ToolSet>,
    options?: { abortSignal?: AbortSignal },
  ) {
    const workersai = createWorkersAI({ binding: this.env.AI });

    const wrappedModel = wrapLanguageModel({
      model: workersai("@cf/zai-org/glm-4.7-flash"),
      middleware: [logMiddleware, upperCaseMiddlware],
    });

    const result = streamText({
      model: wrappedModel,
      messages: await convertToModelMessages(this.messages),
      stopWhen: stepCountIs(5),
      abortSignal: options?.abortSignal,
      onFinish,
    });

    return result.toUIMessageStreamResponse();
  }
}

export default {
  async fetch(request, env) {
    return (
      (await routeAgentRequest(request, env)) ??
      new Response("Not found", { status: 404 })
    );
  },
} satisfies ExportedHandler<Env>;