import { Session, Think } from "@cloudflare/think";
import { callable, routeAgentRequest } from "agents";
import { R2SkillProvider } from "agents/experimental/memory/session";
import { type LanguageModel } from "ai";
import { createExtensionTools } from "@cloudflare/think/tools/extensions";
import { createWorkersAI } from "workers-ai-provider";

type State = {
  files: {
    path: string;
    type: "file" | "directory";
    size: number;
    updatedAt: number;
  }[];
};

export class CoachAgent extends Think<Env, State> {
  extensionLoader = this.env.LOADER;

  initialState: State = {
    files: [],
  };

  async onStart() {
    await this.refreshFiles();
  }

  async onChatResponse() {
    await this.refreshFiles();
    await this.session.refreshSystemPrompt();
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
      ...createExtensionTools({ manager: this.extensionManager! }),
    };
  }

  @callable()
  async readWorkspaceFile(path: string) {
    return await this.workspace.readFile(path);
  }

  // Phase 2+ will replace soul / memory / skills content.
  // Kept as minimal placeholders so configureSession wiring stays intact.
  configureSession(session: Session) {
    return session
      .withContext("soul", {
        provider: {
          async get() {
            return "You are a fitness coach. (Personality TBD in Phase 2.)";
          },
        },
      })
      .withContext("memory", {
        description: "Things to remember about the user across convos.",
        maxTokens: 10_000,
      })
      .withContext("skills", {
        description: "Reference documents on demand.",
        provider: new R2SkillProvider(this.env.SKILLS, { prefix: "skills/" }),
      });
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
