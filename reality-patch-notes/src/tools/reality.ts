import { tool } from "ai";
import { z } from "zod";
import {
  addTarget,
  collectCanonicalEvidence,
  getCurrentContext,
  getCurrentContextMarkdown,
  getSourcePack,
  injectSandboxSessionTestEvidence,
  isRealityInitialized,
  listEvidences,
  listPatches,
  listTargets,
  parseRealityContext,
  removeTarget,
  resolveTargetOrSingle,
  setWatchIntent,
  summarizeEvidence,
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
  startScanTarget(
    targetId: string
  ): Promise<{ workflowId: string; targetId: string }>;
};

const stringList = z.array(z.string().min(1)).optional();
const requiredStringList = z.array(z.string().min(1)).min(1);

export const realityPrompt = `Target management tools (Phase 6):
- listTargets / addTarget / removeTarget
- setWatchIntent / updateWatchIntent
- getReality
- initializeReality ← build initial Reality Context from canonical docs (Workflow)
- getEvidence / collectEvidence
- scanTarget ← fetch, skip duplicate hashes, compare new evidence, patch changed sections (Workflow)
- getPatches ← list stored patches (before / after / evidence)
- injectTestEvidence ← Phase 6 verification helper (sandbox 10min → 30min)

Mandatory tool use:
- "추가해줘" → addTarget before confirming
- "관심 없고" / "만 봐줘" → setWatchIntent before confirming
- "초기 Reality" / "baseline 만들어" → initializeReality
- "근거" / "evidence" / "소스가 뭐야" / "왜 그렇게 알아" → getEvidence
- "같은 문서 다시" / "evidence 수집" / "중복인지 봐" → collectEvidence
- "스캔" / "다시 봐" / "뭐가 달라졌" / "scan" → scanTarget
- "패치" / "patch" / "변경 내역" → getPatches
- "테스트 evidence" / "세션 시간 변경" / "10분" / "30분 넣어" → injectTestEvidence
- Never claim a scan or patch succeeded unless the matching tool returned it
- Patch 0 after scanning the same docs is success

Evidence / patch rules:
- Duplicate content (same SHA-256) is skipped before LLM compare
- Scans patch existing sections only; they never add section keys
- injectTestEvidence is synthetic; say so when reporting it`;

export function createRealityTools(agent: RealityToolHost) {
  return {
    listTargets: tool({
      description:
        "List watch targets currently stored in Agent SQLite. Use when the user asks what is being watched or what exists in storage.",
      inputSchema: z.object({}),
      execute: async () => {
        const targets = listTargets(agent.getRealityStore()).map(
          summarizeTarget
        );
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
        name: z
          .string()
          .optional()
          .describe("Target display name if id unknown")
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
      execute: async (input) =>
        updateWatchIntent(agent.getRealityStore(), input)
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
              "No canonical source pack for this target yet. Phase 6 currently supports Cloudflare Agents only."
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

    scanTarget: tool({
      description:
        "Start a background scan workflow: re-fetch canonical docs, skip identical hashes, semantically compare only new/uncompared evidence, and patch existing Reality sections if a meaningful change is found. Patch 0 is success. REQUIRED when the user asks to scan or what changed versus known reality.",
      inputSchema: z.object({
        targetId: z.string().optional(),
        name: z.string().optional()
      }),
      execute: async ({ targetId, name }) => {
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
              "No canonical source pack for this target yet. Phase 6 currently supports Cloudflare Agents only."
          };
        }

        const existing = await getCurrentContext(store, resolved.target.id);
        if (!isRealityInitialized(existing)) {
          return {
            started: false as const,
            targetId: resolved.target.id,
            name: resolved.target.name,
            message:
              "Reality is not initialized. Run initializeReality before scanning."
          };
        }

        try {
          const started = await agent.startScanTarget(resolved.target.id);
          return {
            started: true as const,
            ...started,
            name: resolved.target.name,
            message:
              "Scan workflow started. Ask getPatches after it finishes. Patch 0 means nothing meaningful changed."
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

    injectTestEvidence: tool({
      description:
        "Phase 6 verification helper. Seeds a sandbox baseline of 10-minute sessions if missing, then stores synthetic evidence that sessions now last 30 minutes. Does not scan. Follow with scanTarget.",
      inputSchema: z.object({
        targetId: z.string().optional(),
        name: z.string().optional()
      }),
      execute: async ({ targetId, name }) => {
        const store = agent.getRealityStore();
        const resolved = resolveTargetOrSingle(store, { targetId, name });
        if (!resolved.target) {
          return { injected: false as const, message: resolved.message };
        }

        try {
          return await injectSandboxSessionTestEvidence(store, resolved.target);
        } catch (error) {
          return {
            injected: false as const,
            targetId: resolved.target.id,
            name: resolved.target.name,
            message: error instanceof Error ? error.message : String(error)
          };
        }
      }
    }),

    collectEvidence: tool({
      description:
        "Re-fetch canonical docs for a target and store new Evidence. Identical content_hash is skipped as a duplicate. Use when the user asks to collect sources again or check whether a document was already seen. Does not create patches.",
      inputSchema: z.object({
        targetId: z.string().optional(),
        name: z.string().optional()
      }),
      execute: async ({ targetId, name }) => {
        const store = agent.getRealityStore();
        const resolved = resolveTargetOrSingle(store, { targetId, name });
        if (!resolved.target) {
          return { collected: false as const, message: resolved.message };
        }

        try {
          const result = await collectCanonicalEvidence(store, resolved.target);
          return {
            collected: true as const,
            ...result,
            message:
              result.skipped > 0 && result.stored === 0
                ? "All fetched sources matched existing content hashes and were skipped."
                : `Stored ${result.stored} new evidence item(s); skipped ${result.skipped} duplicate(s).`
          };
        } catch (error) {
          return {
            collected: false as const,
            targetId: resolved.target.id,
            name: resolved.target.name,
            message: error instanceof Error ? error.message : String(error)
          };
        }
      }
    }),

    getEvidence: tool({
      description:
        "List stored evidence for a target (URL, title, summary, content hash). REQUIRED when the user asks for sources or why Reality was believed. Does not invent URLs.",
      inputSchema: z.object({
        targetId: z.string().optional(),
        name: z.string().optional()
      }),
      execute: async ({ targetId, name }) => {
        const store = agent.getRealityStore();
        const resolved = resolveTargetOrSingle(store, { targetId, name });
        if (!resolved.target) {
          return { found: false as const, message: resolved.message };
        }

        const evidences = listEvidences(store, resolved.target.id).map(
          summarizeEvidence
        );
        return {
          found: true as const,
          targetId: resolved.target.id,
          name: resolved.target.name,
          count: evidences.length,
          evidences,
          message:
            evidences.length === 0
              ? "No evidence stored yet. Run initializeReality or collectEvidence first."
              : undefined
        };
      }
    }),

    getPatches: tool({
      description:
        "List stored Reality patches for a target, including before/after values and linked evidence ids. REQUIRED when the user asks what changed. An empty list means no meaningful changes have been recorded.",
      inputSchema: z.object({
        targetId: z.string().optional(),
        name: z.string().optional()
      }),
      execute: async ({ targetId, name }) => {
        const store = agent.getRealityStore();
        const resolved = resolveTargetOrSingle(store, { targetId, name });
        if (!resolved.target) {
          return { found: false as const, message: resolved.message };
        }

        const patches = listPatches(store, resolved.target.id);
        return {
          found: true as const,
          targetId: resolved.target.id,
          name: resolved.target.name,
          count: patches.length,
          patches,
          message:
            patches.length === 0
              ? "No patches stored yet. Unchanged scans are success."
              : undefined
        };
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
