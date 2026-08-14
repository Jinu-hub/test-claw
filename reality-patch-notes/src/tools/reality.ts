import { tool } from "ai";
import { z } from "zod";
import {
  addTarget,
  getCurrentContext,
  getCurrentContextMarkdown,
  getSourcePack,
  isRealityInitialized,
  listTargets,
  parseRealityContext,
  removeTarget,
  resolveTargetOrSingle,
  setWatchIntent,
  summarizeTarget,
  updateWatchIntent,
  type RealityStore
} from "../reality";

export type RealityToolHost = {
  getRealityStore(): RealityStore;
  startInitializeReality(
    targetId: string,
    force?: boolean
  ): Promise<{ workflowId: string; targetId: string; force: boolean }>;
};

const stringList = z.array(z.string().min(1)).optional();
const requiredStringList = z.array(z.string().min(1)).min(1);

export const realityPrompt = `Target management tools (Phase 4):
- listTargets / addTarget / removeTarget
- setWatchIntent / updateWatchIntent
- getReality
- initializeReality ← build initial Reality Context from canonical docs (Workflow)

Mandatory tool use:
- "추가해줘" → addTarget before confirming
- "관심 없고" / "만 봐줘" → setWatchIntent before confirming
- "초기 Reality" / "baseline 만들어" / "리서치해서 Context 채워" / after adding Cloudflare Agents → initializeReality
- Never claim Reality was initialized unless initializeReality returned started: true
- initializeReality starts a background workflow; tell the user it is running and they can ask getReality shortly

initializeReality rules:
- Phase 4 currently supports Cloudflare Agents source pack only
- Fixture/target_cf_agents may already have seeded content; use force=true to rebuild from live docs
- Bitcoin and other targets without a source pack should get a clear unsupported message from the tool
- Do not invent section content while waiting for the workflow

Other rules:
- Prefer resolving by name; call listTargets when ambiguous
- Still unavailable: scanning for changes, patches, evidence linking`;

export function createRealityTools(agent: RealityToolHost) {
  return {
    listTargets: tool({
      description:
        "List watch targets currently stored in Agent SQLite. Use when the user asks what is being watched or what exists in storage.",
      inputSchema: z.object({}),
      execute: async () => {
        const targets = listTargets(agent.getRealityStore()).map(summarizeTarget);
        return targets.length > 0
          ? { targets }
          : { targets: [], message: "No targets stored yet." };
      }
    }),

    addTarget: tool({
      description:
        "Register a new watch target. Creates a SQLite row and an uninitialized Reality Context template in R2. Does not research. For Cloudflare Agents, follow with initializeReality.",
      inputSchema: z.object({
        name: z.string().min(1).describe("Display name of the target to watch"),
        description: z
          .string()
          .optional()
          .describe("Optional short description of the target"),
        category: z
          .string()
          .optional()
          .describe("Optional category, e.g. technology, finance, regulation"),
        focus: stringList.describe("Optional initial focus topics"),
        ignore: stringList.describe("Optional topics to ignore"),
        priority: stringList.describe("Optional priority topics")
      }),
      execute: async (input) => addTarget(agent.getRealityStore(), input)
    }),

    removeTarget: tool({
      description:
        "Remove a watch target by id or name. Deletes SQLite rows and the R2 current.md object.",
      inputSchema: z.object({
        targetId: z.string().optional().describe("Target id if known"),
        name: z.string().optional().describe("Target display name if id unknown")
      }),
      execute: async (input) => removeTarget(agent.getRealityStore(), input)
    }),

    setWatchIntent: tool({
      description:
        "Replace the full watch intent. REQUIRED for utterances like '가격은 관심 없고 ETF, 규제만 봐줘'.",
      inputSchema: z.object({
        targetId: z.string().optional(),
        name: z.string().optional(),
        focus: requiredStringList.describe(
          "Exact topics to watch after this update"
        ),
        ignore: z
          .array(z.string().min(1))
          .describe("Topics to ignore. Use [] if none."),
        priority: stringList.describe(
          "Optional priority subset. Defaults to focus when omitted."
        )
      }),
      execute: async (input) => setWatchIntent(agent.getRealityStore(), input)
    }),

    updateWatchIntent: tool({
      description:
        "Partial watch-intent tweak. Prefer setWatchIntent when redefining what to watch. Use mode=merge to append items.",
      inputSchema: z.object({
        targetId: z.string().optional(),
        name: z.string().optional(),
        focus: stringList,
        ignore: stringList,
        priority: stringList,
        mode: z.enum(["replace", "merge"]).optional()
      }),
      execute: async (input) => updateWatchIntent(agent.getRealityStore(), input)
    }),

    initializeReality: tool({
      description:
        "Start a background workflow that fetches canonical docs and writes the initial Reality Context to R2. REQUIRED before claiming baseline research completed. Currently supports Cloudflare Agents. Use force=true to rebuild an already initialized target.",
      inputSchema: z.object({
        targetId: z.string().optional(),
        name: z.string().optional(),
        force: z
          .boolean()
          .optional()
          .describe(
            "Rebuild even if Reality already looks initialized. Use true for the seeded Cloudflare Agents fixture."
          )
      }),
      execute: async ({ targetId, name, force }) => {
        const store = agent.getRealityStore();
        const resolved = resolveTargetOrSingle(store, { targetId, name });
        if (!resolved.target) {
          return { started: false as const, message: resolved.message };
        }

        const pack = getSourcePack(resolved.target);
        if (!pack) {
          return {
            started: false as const,
            targetId: resolved.target.id,
            name: resolved.target.name,
            message:
              "No canonical source pack for this target yet. Phase 4 currently supports Cloudflare Agents only."
          };
        }

        const existing = await getCurrentContext(store, resolved.target.id);
        const already = isRealityInitialized(existing);
        if (already && !force) {
          return {
            started: false as const,
            targetId: resolved.target.id,
            name: resolved.target.name,
            alreadyInitialized: true,
            message:
              "Reality already looks initialized. Re-run with force=true to rebuild from live docs."
          };
        }

        try {
          const started = await agent.startInitializeReality(
            resolved.target.id,
            Boolean(force)
          );
          return {
            started: true as const,
            ...started,
            name: resolved.target.name,
            packId: pack.id,
            message:
              "Initialize Reality workflow started. Ask getReality after it finishes."
          };
        } catch (error) {
          return {
            started: false as const,
            targetId: resolved.target.id,
            name: resolved.target.name,
            message: error instanceof Error ? error.message : String(error)
          };
        }
      }
    }),

    getReality: tool({
      description:
        "Read the current Reality Context markdown for a target from R2.",
      inputSchema: z.object({
        targetId: z.string().optional(),
        name: z.string().optional()
      }),
      execute: async ({ targetId, name }) => {
        const store = agent.getRealityStore();
        const resolved = resolveTargetOrSingle(store, { targetId, name });
        if (!resolved.target) {
          return {
            found: false,
            message: resolved.message
          };
        }

        const target = resolved.target;
        const markdown = await getCurrentContextMarkdown(store, target.id);
        if (!markdown) {
          return {
            targetId: target.id,
            name: target.name,
            found: false,
            message: `No current.md found in R2 for ${target.id}.`
          };
        }

        return {
          targetId: target.id,
          name: target.name,
          found: true,
          initialized: isRealityInitialized(
            parseRealityContext(markdown, target.id)
          ),
          objectKey: `targets/${target.id}/current.md`,
          markdown
        };
      }
    })
  };
}
