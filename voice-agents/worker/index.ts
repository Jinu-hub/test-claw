import { Agent, routeAgentRequest } from "agents";
import {
  withVoice,
  WorkersAIFluxSTT,
  WorkersAITTS,
  type VoiceTurnContext,
} from "@cloudflare/voice";
import { createWorkersAI } from "workers-ai-provider";
import { isLoopFinished, streamText, tool } from "ai";
import z from "zod";

const VoiceAgentBase = withVoice(Agent);

export class VoiceAgent extends VoiceAgentBase<Env> {
  // memo: more better quality if use ElevenLabs TTS
  transcriber = new WorkersAIFluxSTT(this.env.AI); // Speech to text
  tts = new WorkersAITTS(this.env.AI); // Text to speech

  async onTurn(transcript: string, context: VoiceTurnContext) {
    const workersAi = createWorkersAI({ binding: this.env.AI });

    const result = streamText({
      model: workersAi("@cf/zai-org/glm-4.7-flash"),
      stopWhen: isLoopFinished(),
      messages: [
        ...context.messages,
        {
          role: "user",
          content: transcript,
        },
      ],
      tools: {
        getWeather: tool({
          description: "Get the weather of a city",
          inputSchema: z.object({ city: z.string() }),
          execute: ({ city }) => `The weather in city is ${city}`,
        }),
      },
    });

    return result.textStream;
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