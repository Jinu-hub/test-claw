import { tool } from "ai";
import { z } from "zod";
import {
  createScheduledScanPayload,
  getCurrentContext,
  getSourcePack,
  isRealityInitialized,
  parseScheduledTaskPayload,
  resolveTargetOrSingle,
  type RealityStore
} from "../reality";
import type { ScheduleToolHost } from "./shared";

const scanWhenSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("delayed"),
    delayInSeconds: z
      .number()
      .int()
      .min(60)
      .describe("Run once after this many seconds (minimum 60)")
  }),
  z.object({
    type: z.literal("cron"),
    cron: z
      .string()
      .min(1)
      .describe("Cron expression, e.g. 0 9 * * * for daily at 09:00 UTC")
  }),
  z.object({
    type: z.literal("scheduled"),
    date: z
      .string()
      .min(1)
      .describe("ISO datetime or parseable date string for a one-time scan")
  })
]);

export type RealityScheduleToolHost = ScheduleToolHost & {
  getRealityStore(): RealityStore;
};

export const realitySchedulePrompt = `Scheduled scan tools (Phase 7):
- scheduleScan ← recurring or one-time background scan via ScanTargetWorkflow
- listScheduledScans / cancelScheduledScan

Mandatory tool use:
- "매일 스캔" / "정기적으로 봐" / "cron" / "N분마다 스캔" → scheduleScan
- "예약된 스캔" / "스케줄 목록" → listScheduledScans
- "스캔 취소" → cancelScheduledScan
- Scheduled scans trigger the same scanTarget workflow as manual scans
- Patch 0 after a scheduled scan is success`;

function summarizeScheduleEntry(task: unknown) {
  if (typeof task !== "object" || task === null) {
    return null;
  }

  const record = task as Record<string, unknown>;
  if (record.callback !== "executeTask") {
    return null;
  }

  const payload = parseScheduledTaskPayload(record.payload);
  if (payload.kind !== "scan-target") {
    return null;
  }

  const time =
    typeof record.time === "number"
      ? new Date(record.time * 1000).toISOString()
      : undefined;

  return {
    id: typeof record.id === "string" ? record.id : undefined,
    targetId: payload.targetId,
    name: payload.name,
    callback: "executeTask" as const,
    type: typeof record.type === "string" ? record.type : undefined,
    cron: typeof record.cron === "string" ? record.cron : undefined,
    delayInSeconds:
      typeof record.delayInSeconds === "number"
        ? record.delayInSeconds
        : undefined,
    intervalSeconds:
      typeof record.intervalSeconds === "number"
        ? record.intervalSeconds
        : undefined,
    nextRunAt: time
  };
}

async function listScanSchedules(agent: RealityScheduleToolHost) {
  const schedules = await agent.listSchedules();
  return schedules
    .map(summarizeScheduleEntry)
    .filter((task): task is NonNullable<typeof task> => Boolean(task));
}

export function createRealityScheduleTools(agent: RealityScheduleToolHost) {
  return {
    scheduleScan: tool({
      description:
        "Schedule a background scan for a target. Uses the same ScanTargetWorkflow as scanTarget. REQUIRED when the user asks for periodic or delayed automatic scanning.",
      inputSchema: z.object({
        targetId: z.string().optional(),
        name: z.string().optional(),
        when: scanWhenSchema
      }),
      execute: async ({ targetId, name, when }) => {
        const store = agent.getRealityStore();
        const resolved = resolveTargetOrSingle(store, { targetId, name });
        if (!resolved.target) {
          return { scheduled: false as const, message: resolved.message };
        }

        const pack = getSourcePack(resolved.target);
        if (!pack) {
          return {
            scheduled: false as const,
            targetId: resolved.target.id,
            name: resolved.target.name,
            message:
              "No canonical source pack for this target yet. Scheduled scans currently support Cloudflare Agents only."
          };
        }

        const existing = await getCurrentContext(store, resolved.target.id);
        if (!isRealityInitialized(existing)) {
          return {
            scheduled: false as const,
            targetId: resolved.target.id,
            name: resolved.target.name,
            message:
              "Reality is not initialized. Run initializeReality before scheduling scans."
          };
        }

        const payload = createScheduledScanPayload({
          targetId: resolved.target.id,
          name: resolved.target.name
        });

        let scheduleInput: Date | number | string;
        if (when.type === "scheduled") {
          const scheduledAt = new Date(when.date);
          if (Number.isNaN(scheduledAt.getTime())) {
            return {
              scheduled: false as const,
              targetId: resolved.target.id,
              name: resolved.target.name,
              message: `Invalid scheduled date: ${when.date}`
            };
          }
          scheduleInput = scheduledAt;
        } else if (when.type === "delayed") {
          scheduleInput = when.delayInSeconds;
        } else {
          scheduleInput = when.cron;
        }

        try {
          const created = await agent.schedule(
            scheduleInput,
            "executeTask",
            payload,
            { idempotent: true }
          );
          const scans = await listScanSchedules(agent);

          return {
            scheduled: true as const,
            scheduleId: created.id,
            targetId: resolved.target.id,
            name: resolved.target.name,
            when,
            registeredCount: scans.length,
            message:
              "Scheduled scan registered. Results appear as a scan toast when the workflow finishes."
          };
        } catch (error) {
          return {
            scheduled: false as const,
            targetId: resolved.target.id,
            name: resolved.target.name,
            message: error instanceof Error ? error.message : String(error)
          };
        }
      }
    }),

    listScheduledScans: tool({
      description:
        "List scheduled background scans for targets. Use when the user asks what scans are scheduled.",
      inputSchema: z.object({}),
      execute: async () => {
        const scans = await listScanSchedules(agent);

        return scans.length > 0
          ? { scans, count: scans.length }
          : {
              scans: [],
              count: 0,
              message: "No scheduled scans found."
            };
      }
    }),

    cancelScheduledScan: tool({
      description:
        "Cancel a scheduled scan by schedule id from listScheduledScans.",
      inputSchema: z.object({
        scheduleId: z.string().min(1)
      }),
      execute: async ({ scheduleId }) => {
        try {
          const cancelled = await agent.cancelSchedule(scheduleId);
          return cancelled
            ? {
                cancelled: true as const,
                scheduleId,
                message: `Scheduled scan ${scheduleId} cancelled.`
              }
            : {
                cancelled: false as const,
                scheduleId,
                message: `Schedule ${scheduleId} was not found.`
              };
        } catch (error) {
          return {
            cancelled: false as const,
            scheduleId,
            message: error instanceof Error ? error.message : String(error)
          };
        }
      }
    })
  };
}
