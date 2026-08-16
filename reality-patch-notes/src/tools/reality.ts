import { tool } from "ai";
import { z } from "zod";
import {
  acceptSectionProposal,
  addTarget,
  collectCanonicalEvidence,
  getCurrentContext,
  getCurrentContextMarkdown,
  getSourcePack,
  injectNewSectionTestEvidence,
  injectSandboxSessionTestEvidence,
  isRealityInitialized,
  listEvidences,
  listSectionProposals,
  listTargets,
  parseRealityContext,
  queryPatches,
  rejectSectionProposal,
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
  notifyActivityChanged(targetId: string, reason: string): void;
};

const stringList = z.array(z.string().min(1)).optional();
const requiredStringList = z.array(z.string().min(1)).min(1);

export const realityPrompt = `Target management tools (Phase 8):
- listTargets / addTarget / removeTarget
- setWatchIntent / updateWatchIntent
- getReality
- initializeReality ← build initial Reality Context from canonical docs (Workflow)
- getEvidence / collectEvidence
- scanTarget ← fetch, skip duplicates, patch existing sections, propose NEW sections (Workflow)
- getPatches ← list/filter patches
- listSectionProposals / acceptSectionProposal / rejectSectionProposal
- scheduleScan / listScheduledScans / cancelScheduledScan
- injectTestEvidence ← verification (sandbox change OR new-section Voice proposal)

Mandatory tool use:
- "추가해줘" → addTarget before confirming
- "관심 없고" / "만 봐줘" → setWatchIntent before confirming
- "초기 Reality" / "baseline 만들어" → initializeReality
- "근거" / "evidence" / "근거 링크" → getEvidence
- "Watch Intent" / "관심사" / "관심 설정" → getReality part=watch-intent, then summarize Focus / Ignore / Priority only
- "알고 있는 내용" / "Reality Context" → getReality part=summary, then summarize clearly
- After every tool result, always write a user-facing briefing
- "스캔" / "scan" / "새로고침해서 확인" → scanTarget
- "오늘 뭐 바뀐" / "패치" → getPatches
- "새 기능 제안" / "섹션 제안" / "제안 목록" → listSectionProposals
- "제안 반영" / "섹션 추가해줘" / "accept" → acceptSectionProposal
- "제안 거절" / "reject" → rejectSectionProposal
- "매일 스캔" → scheduleScan
- "테스트 evidence" / "세션 시간" → injectTestEvidence kind=sandbox
- "새 섹션 테스트" / "Voice 테스트 evidence" → injectTestEvidence kind=new-section
- Never claim a scan, proposal, or patch unless the matching tool returned it
- Never claim pending proposals are empty unless listSectionProposals returned count 0
- Never claim accept/reject succeeded unless the tool returned accepted/rejected: true
- Scans do NOT auto-add sections; proposals need acceptSectionProposal
- Patch 0 after scanning the same docs is success

Query rules:
- Answer change questions from patch history, not from memory
- Quote evidence URLs only from tool results`;

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
              "Scan workflow started. Ask getPatches or listSectionProposals after it finishes. Patch 0 means nothing meaningful changed; new capabilities appear as proposals until accepted."
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
        "Verification helper. kind=sandbox seeds 10→30 minute session change. kind=new-section stores synthetic Voice capability evidence that should become a pending section proposal after scan. Does not scan.",
      inputSchema: z.object({
        targetId: z.string().optional(),
        name: z.string().optional(),
        kind: z
          .enum(["sandbox", "new-section"])
          .optional()
          .describe(
            "sandbox (default) or new-section for Phase 8 proposal test"
          )
      }),
      execute: async ({ targetId, name, kind }) => {
        const store = agent.getRealityStore();
        const resolved = resolveTargetOrSingle(store, { targetId, name });
        if (!resolved.target) {
          return { injected: false as const, message: resolved.message };
        }

        try {
          if (kind === "new-section") {
            return await injectNewSectionTestEvidence(store, resolved.target);
          }
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

    listSectionProposals: tool({
      description:
        "List section proposals from scans (pending/accepted/rejected). REQUIRED when the user asks about new capability proposals. Scans do not auto-add sections.",
      inputSchema: z.object({
        targetId: z.string().optional(),
        name: z.string().optional(),
        status: z.enum(["pending", "accepted", "rejected"]).optional()
      }),
      execute: async ({ targetId, name, status }) => {
        const store = agent.getRealityStore();
        const resolved = resolveTargetOrSingle(store, { targetId, name });
        if (!resolved.target) {
          return { found: false as const, message: resolved.message };
        }

        const proposals = listSectionProposals(
          store,
          resolved.target.id,
          status
        );
        return {
          found: true as const,
          targetId: resolved.target.id,
          name: resolved.target.name,
          count: proposals.length,
          status: status ?? "all",
          proposals,
          message:
            proposals.length === 0
              ? "No section proposals. New capabilities appear here after a scan finds them."
              : undefined
        };
      }
    }),

    acceptSectionProposal: tool({
      description:
        "Accept a pending section proposal: add the section to Reality current.md and create an ADDED patch. REQUIRED before claiming a new section was added.",
      inputSchema: z.object({
        proposalId: z.string().min(1),
        targetId: z.string().optional(),
        name: z.string().optional()
      }),
      execute: async ({ proposalId, targetId, name }) => {
        const store = agent.getRealityStore();
        const resolved = resolveTargetOrSingle(store, { targetId, name });
        if (!resolved.target) {
          return { accepted: false as const, message: resolved.message };
        }

        try {
          const result = await acceptSectionProposal(
            store,
            resolved.target,
            proposalId
          );
          if (result.accepted) {
            agent.notifyActivityChanged(
              resolved.target.id,
              "acceptSectionProposal"
            );
          }
          return result;
        } catch (error) {
          return {
            accepted: false as const,
            message: error instanceof Error ? error.message : String(error)
          };
        }
      }
    }),

    rejectSectionProposal: tool({
      description:
        "Reject a pending section proposal without changing Reality.",
      inputSchema: z.object({
        proposalId: z.string().min(1),
        targetId: z.string().optional(),
        name: z.string().optional()
      }),
      execute: async ({ proposalId, targetId, name }) => {
        const store = agent.getRealityStore();
        const resolved = resolveTargetOrSingle(store, { targetId, name });
        if (!resolved.target) {
          return { rejected: false as const, message: resolved.message };
        }

        const result = rejectSectionProposal(
          store,
          resolved.target.id,
          proposalId
        );
        if (result.rejected) {
          agent.notifyActivityChanged(
            resolved.target.id,
            "rejectSectionProposal"
          );
        }
        return result;
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
        "List or filter stored Reality patches for a target, including before/after values and linked evidence URLs. REQUIRED for change-history questions such as 'what changed today?' or 'Sandbox last month?'. An empty list means no meaningful changes were recorded in that window.",
      inputSchema: z.object({
        targetId: z.string().optional(),
        name: z.string().optional(),
        sectionKey: z
          .string()
          .optional()
          .describe("Filter to one section key, e.g. sandbox"),
        since: z
          .string()
          .optional()
          .describe(
            "ISO datetime lower bound, e.g. start of today or last month"
          ),
        until: z.string().optional().describe("ISO datetime upper bound"),
        limit: z.number().int().min(1).max(50).optional()
      }),
      execute: async ({ targetId, name, sectionKey, since, until, limit }) => {
        const store = agent.getRealityStore();
        const resolved = resolveTargetOrSingle(store, { targetId, name });
        if (!resolved.target) {
          return { found: false as const, message: resolved.message };
        }

        const patches = queryPatches(store, {
          targetId: resolved.target.id,
          sectionKey,
          since,
          until,
          limit
        });
        return {
          found: true as const,
          targetId: resolved.target.id,
          name: resolved.target.name,
          count: patches.length,
          filters: { sectionKey, since, until, limit },
          patches,
          message:
            patches.length === 0
              ? "No patches matched this query. Unchanged scans are success."
              : undefined
        };
      }
    }),

    getReality: tool({
      description:
        "Read Reality Context for a target. Use part=watch-intent for Focus/Ignore/Priority only, part=summary for section overview, part=full for complete markdown. Prefer watch-intent or summary for chat answers so you can still write a briefing.",
      inputSchema: z.object({
        targetId: z.string().optional(),
        name: z.string().optional(),
        part: z
          .enum(["watch-intent", "summary", "full"])
          .optional()
          .describe(
            "watch-intent (interest settings), summary (section titles), or full markdown"
          )
      }),
      execute: async ({ targetId, name, part }) => {
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

        const context = parseRealityContext(markdown, target.id);
        const view = part ?? "summary";

        if (view === "watch-intent") {
          return {
            targetId: target.id,
            name: target.name,
            found: true,
            part: "watch-intent" as const,
            focus: context.intent.focus,
            ignore: context.intent.ignore,
            priority: context.intent.priority,
            message:
              "Reply to the user with Focus / Ignore / Priority only. Do not dump raw JSON."
          };
        }

        if (view === "summary") {
          return {
            targetId: target.id,
            name: target.name,
            found: true,
            part: "summary" as const,
            initialized: isRealityInitialized(context),
            profile: context.profile,
            intent: context.intent,
            sections: context.sections.map((section) => ({
              key: section.key,
              title: section.title,
              preview: section.body.slice(0, 220)
            })),
            openQuestions: context.openQuestions,
            message:
              "Summarize what is currently known in readable Korean/English for the user. Do not dump raw JSON."
          };
        }

        return {
          targetId: target.id,
          name: target.name,
          found: true,
          part: "full" as const,
          initialized: isRealityInitialized(context),
          objectKey: `targets/${target.id}/current.md`,
          markdown,
          message:
            "Full markdown loaded. Still write a short user-facing briefing after this tool."
        };
      }
    })
  };
}
