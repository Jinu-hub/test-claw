import { Think } from "@cloudflare/think";
import { callable, routeAgentRequest } from "agents";
import { tool, type LanguageModel } from "ai";
import { createWorkersAI } from "workers-ai-provider";
import z from "zod";

type State = {
  files: {
    path: string;
    type: "file" | "directory";
    size: number;
    updatedAt: number;
  }[];
};
export class ThinkAgent extends Think<Env, State> {
  initialState: State = {
    files: [],
  };

  async onStart() {
    await this.refreshFiles();
  }

  async onChatResponse() {
    await this.refreshFiles();
  }

  async refreshFiles() {
    const all = await this.workspace.glob("**/*");
    this.setState({
      files: all.map((file) => ({
        type: file.type === "directory" ? "directory" : "file",
        path: file.path,
        size: file.size,
        updatedAt: file.updatedAt,
      })),
    });
  }

  getModel(): LanguageModel {
    const workersAI = createWorkersAI({ binding: this.env.AI });
    return workersAI("@cf/moonshotai/kimi-k2.5");
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

  @callable()
  async readWorkspaceFile(path: string) {
    return await this.workspace.readFile(path);
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