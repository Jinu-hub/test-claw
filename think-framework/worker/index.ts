import { Think } from "@cloudflare/think";
import { routeAgentRequest } from "agents";
import { tool, type LanguageModel } from "ai";
import { createWorkersAI } from "workers-ai-provider";
import z from "zod";

export class ThinkAgent extends Think<Env> {
  getModel(): LanguageModel {
    const workersAI = createWorkersAI({ binding: this.env.AI });
    return workersAI("@cf/zai-org/glm-4.7-flash");
  }

  getTools() {
    return {
      getWeather: tool({
        description: "Get weather",
        inputSchema: z.object({
          city: z.string().meta({ description: "Name fo the city." }),
        }),
        execute: ({ city }) => `The ${city} is sunny`,
      }),
    };
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