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
      ...this.extensionManager!.getTools(),
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
              "",
              "Persistent memory rules:",
              "- When the user shares body stats, injuries/limitations, or goals, immediately save them with set_context on the memory block.",
              "- Always consult memory before planning workouts so injuries and goals shape the plan.",
              "",
              "Skill rules (on-demand guides in the skills context):",
              "- When the user asks about squat form, running plans, or stretching/mobility, load_context the matching skill first.",
              "- Available skill keys: squat-form.md, running-program.md, stretching.md.",
              "- After you finish answering from a skill, unload_context it so the prompt stays lean.",
              "- Do not keep skills loaded across unrelated turns.",
              "",
              "Runtime extension tools:",
              "- You can create new tools at runtime with load_extension (JavaScript source).",
              "- When the user asks for a 1RM calculator, write and load an extension named onerm (or similar) with a tool that estimates one-rep max.",
              "- Prefer the Epley formula: 1RM = weightKg * (1 + reps / 30). Example: 80kg × 5 reps ≈ 93.3kg.",
              "- After loading, answer 1RM questions by calling the extension tool — do not estimate by hand.",
              "- list_extensions first if unsure whether the calculator is already loaded.",
            ].join("\n");
          },
        },
      })
      .withContext("memory", {
        description: [
          "Persistent athlete profile across conversations.",
          "Store and update: body stats (weight, height, etc.), injuries/limitations, and training goals.",
          "Use set_context whenever the user shares or changes any of these facts.",
          "Example: weight 75kg, left knee issue, goal run 5km under 30 minutes.",
        ].join(" "),
        maxTokens: 10_000,
      })
      .withContext("skills", {
        description: [
          "On-demand training guides. Use load_context / unload_context.",
          "squat-form.md — squat setup, depth, faults, knee-friendly cues.",
          "running-program.md — 5km progression, weekly structure, pacing.",
          "stretching.md — warm-up mobility and post-workout stretching.",
        ].join(" "),
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
