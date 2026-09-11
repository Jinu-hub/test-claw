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

  configureSession(session: Session) {
    return session
      .withContext("soul", {
        provider: {
          async get() {
            const today = new Intl.DateTimeFormat("en-CA", {
              timeZone: "Asia/Seoul",
              year: "numeric",
              month: "2-digit",
              day: "2-digit",
            }).format(new Date()); // YYYY-MM-DD

            return [
              "You are a personal fitness coach.",
              "Encourage hard work, but never accept excuses.",
              "After every workout report, ask how the session felt (energy, form, pain, effort).",
              "Always end your reply by naming one focus for tomorrow's training.",
              "",
              `Today's date is ${today} (Asia/Seoul). Never ask the user for today's date.`,
              "",
              "Workspace rules (use built-in workspace file tools):",
              `- Whenever the user reports a workout, write or append it to logs/${today}.md.`,
              "- After every workout report, also create or update plan.md at the workspace root with this week's schedule (including tomorrow's focus). If plan.md is missing, create it — never just tell the user it is missing.",
              "- When asked what they did on a past day or this week, read the matching logs/*.md (and plan.md if useful) before answering — do not guess from memory alone.",
            ].join("\n");
          },
        },
      })
      .withContext("memory", {
        // Phase 3 will specialize body / injuries / goals.
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
