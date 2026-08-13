export const SCHEDULED_TASK_TYPE = "scheduled-task";

export const MAX_TOOL_STEPS = 20;
export const CALCULATE_APPROVAL_THRESHOLD = 1000;

export type ScheduledTaskEvent = {
  type: typeof SCHEDULED_TASK_TYPE;
  description: string;
  timestamp: string;
};

export function parseScheduledTaskEvent(
  data: unknown
): ScheduledTaskEvent | null {
  if (
    typeof data !== "object" ||
    data === null ||
    !("type" in data) ||
    data.type !== SCHEDULED_TASK_TYPE ||
    !("description" in data) ||
    typeof data.description !== "string"
  ) {
    return null;
  }

  return {
    type: SCHEDULED_TASK_TYPE,
    description: data.description,
    timestamp:
      "timestamp" in data && typeof data.timestamp === "string"
        ? data.timestamp
        : new Date().toISOString()
  };
}

export type ScheduleToolHost = {
  schedule(
    when: Date | number | string,
    callback: "executeTask",
    payload: string,
    options?: { idempotent?: boolean }
  ): unknown;
  getSchedules(): unknown[];
  cancelSchedule(id: string): unknown;
};
