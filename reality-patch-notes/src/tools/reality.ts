import { tool } from "ai";
import { z } from "zod";
import {
  addTarget,
  getCurrentContextMarkdown,
  listTargets,
  removeTarget,
  resolveTargetOrSingle,
  setWatchIntent,
  summarizeTarget,
  updateWatchIntent,
  type RealityStore
} from "../reality";

export type RealityToolHost = {
  getRealityStore(): RealityStore;
};

const stringList = z.array(z.string().min(1)).optional();
const requiredStringList = z.array(z.string().min(1)).min(1);

export const realityPrompt = `Target management tools (Phase 3):
- listTargets
- addTarget
- removeTarget
- setWatchIntent  ← preferred for redefining what to watch
- updateWatchIntent ← only for partial add/merge tweaks
- getReality

Mandatory tool use:
- "추가해줘" / add / watch → addTarget before confirming
- "관심 없고" / "만 봐줘" / "만 추적" → setWatchIntent before confirming
- small additive tweaks like "ETF도 추가해줘" → updateWatchIntent with mode "merge"
- "제거해줘" / remove → removeTarget before confirming
- Never claim intent changed unless setWatchIntent or updateWatchIntent returned updated: true
- After success, quote ONLY the returned focus / ignore / priority arrays

setWatchIntent mapping examples:
- User: "가격 변화는 관심 없고 ETF, 규제만 봐줘."
  → setWatchIntent({ name: "Bitcoin", focus: ["ETF", "regulation"], ignore: ["price"] })
- User: "Sandbox와 Browser만 중요해."
  → setWatchIntent({ name: "Cloudflare Agents", focus: ["Sandbox", "Browser"], ignore: [] })
- Do NOT call updateWatchIntent with only priority for these utterances
- Do NOT leave old focus items when the user says "만 봐줘"

Other rules:
- Newly added targets are NOT researched yet
- Prefer resolving by name; call listTargets when ambiguous
- Still unavailable: research, scan, patches, evidence collection`;

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
        "Register a new watch target. Creates a SQLite row and an uninitialized Reality Context template in R2. Does not research or initialize baseline content. REQUIRED before telling the user a target was added.",
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
        "Remove a watch target by id or name. Deletes SQLite rows and the R2 current.md object. REQUIRED before telling the user a target was removed. If name/id omitted and exactly one target exists, that target is used.",
      inputSchema: z.object({
        targetId: z.string().optional().describe("Target id if known"),
        name: z.string().optional().describe("Target display name if id unknown")
      }),
      execute: async (input) => removeTarget(agent.getRealityStore(), input)
    }),

    setWatchIntent: tool({
      description:
        "Replace the full watch intent. REQUIRED for utterances like '가격은 관심 없고 ETF, 규제만 봐줘' or 'Sandbox만 봐줘'. Always pass the complete focus list and ignore list. Old focus items are discarded. Do not claim success without this tool.",
      inputSchema: z.object({
        targetId: z.string().optional(),
        name: z
          .string()
          .optional()
          .describe("Target name from conversation when known"),
        focus: requiredStringList.describe(
          "Exact topics to watch after this update"
        ),
        ignore: z
          .array(z.string().min(1))
          .describe(
            "Topics to ignore. Use [] if none. For '가격은 관심 없고', include price."
          ),
        priority: stringList.describe(
          "Optional priority subset. Defaults to focus when omitted."
        )
      }),
      execute: async (input) => setWatchIntent(agent.getRealityStore(), input)
    }),

    updateWatchIntent: tool({
      description:
        "Partial watch-intent tweak. Prefer setWatchIntent when the user redefines what to watch. Use this mainly with mode=merge to append items (e.g. 'ETF도 추가해줘'). Ignore terms are removed from focus/priority automatically.",
      inputSchema: z.object({
        targetId: z.string().optional(),
        name: z
          .string()
          .optional()
          .describe("Target name from conversation when known"),
        focus: stringList.describe("Focus topics to set or merge"),
        ignore: stringList.describe("Ignore topics to set or merge"),
        priority: stringList.describe("Priority topics to set or merge"),
        mode: z
          .enum(["replace", "merge"])
          .optional()
          .describe(
            "replace (default): overwrite provided fields. merge: append to existing lists."
          )
      }),
      execute: async (input) => updateWatchIntent(agent.getRealityStore(), input)
    }),

    getReality: tool({
      description:
        "Read the current Reality Context markdown for a target from R2. Use when the user asks what is currently known about a target, or to verify intent after an update.",
      inputSchema: z.object({
        targetId: z
          .string()
          .optional()
          .describe("Target id such as target_cf_agents"),
        name: z.string().optional().describe("Target display name")
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
          objectKey: `targets/${target.id}/current.md`,
          markdown
        };
      }
    })
  };
}
