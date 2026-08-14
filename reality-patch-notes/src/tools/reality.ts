import { tool } from "ai";
import { z } from "zod";
import {
  getCurrentContextMarkdown,
  listTargets,
  parseWatchIntent,
  type RealityStore
} from "../reality";

export type RealityToolHost = {
  getRealityStore(): RealityStore;
};

export const realityPrompt = `Storage is available (Phase 2):
- A fixture watch target "Cloudflare Agents" (id: target_cf_agents) is seeded into Agent SQLite + R2
- You can list stored targets and read the current Reality Context markdown with tools
- You still cannot create, remove, or change targets via chat
- You still cannot research, scan, or create patches

When the user asks what is stored or what Cloudflare Agents reality looks like, use the tools.
Do not invent context that is not returned by the tools.`;

export function createRealityTools(agent: RealityToolHost) {
  return {
    listTargets: tool({
      description:
        "List watch targets currently stored in Agent SQLite. Use when the user asks what is being watched or what exists in storage.",
      inputSchema: z.object({}),
      execute: async () => {
        const targets = listTargets(agent.getRealityStore()).map((target) => ({
          id: target.id,
          name: target.name,
          description: target.description,
          category: target.category,
          status: target.status,
          intent: parseWatchIntent(target.watch_intent_json),
          createdAt: target.created_at,
          updatedAt: target.updated_at
        }));
        return targets.length > 0
          ? { targets }
          : { targets: [], message: "No targets stored yet." };
      }
    }),

    getReality: tool({
      description:
        "Read the current Reality Context markdown for a target from R2. Use when the user asks what is currently known about a target.",
      inputSchema: z.object({
        targetId: z
          .string()
          .optional()
          .describe(
            "Target id such as target_cf_agents. If omitted, defaults to target_cf_agents when that fixture exists."
          )
      }),
      execute: async ({ targetId }) => {
        const store = agent.getRealityStore();
        const id = targetId?.trim() || "target_cf_agents";
        const markdown = await getCurrentContextMarkdown(store, id);
        if (!markdown) {
          return {
            targetId: id,
            found: false,
            message: `No current.md found in R2 for ${id}.`
          };
        }
        return {
          targetId: id,
          found: true,
          objectKey: `targets/${id}/current.md`,
          markdown
        };
      }
    })
  };
}
