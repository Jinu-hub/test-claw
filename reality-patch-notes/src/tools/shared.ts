export const SCHEDULED_TASK_TYPE = "scheduled-task";
export const REALITY_INITIALIZED_TYPE = "reality-initialized";
export const REALITY_SCANNED_TYPE = "reality-scanned";

export const MAX_TOOL_STEPS = 20;
export const CALCULATE_APPROVAL_THRESHOLD = 1000;

export type ScheduledTaskEvent = {
  type: typeof SCHEDULED_TASK_TYPE;
  description: string;
  timestamp: string;
};

export type RealityInitializedEvent = {
  type: typeof REALITY_INITIALIZED_TYPE;
  targetId: string;
  name: string;
  sectionKeys: string[];
  sourcesFetched: number;
  timestamp: string;
};

export type RealityScannedEvent = {
  type: typeof REALITY_SCANNED_TYPE;
  targetId: string;
  name: string;
  patchesCreated: number;
  patchedSectionKeys: string[];
  skipped: number;
  llmCalled: boolean;
  message: string;
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

export function parseRealityInitializedEvent(
  data: unknown
): RealityInitializedEvent | null {
  if (
    typeof data !== "object" ||
    data === null ||
    !("type" in data) ||
    data.type !== REALITY_INITIALIZED_TYPE
  ) {
    return null;
  }

  return {
    type: REALITY_INITIALIZED_TYPE,
    targetId:
      "targetId" in data && typeof data.targetId === "string"
        ? data.targetId
        : "",
    name: "name" in data && typeof data.name === "string" ? data.name : "",
    sectionKeys:
      "sectionKeys" in data && Array.isArray(data.sectionKeys)
        ? data.sectionKeys.filter(
            (item): item is string => typeof item === "string"
          )
        : [],
    sourcesFetched:
      "sourcesFetched" in data && typeof data.sourcesFetched === "number"
        ? data.sourcesFetched
        : 0,
    timestamp:
      "timestamp" in data && typeof data.timestamp === "string"
        ? data.timestamp
        : new Date().toISOString()
  };
}

export function parseRealityScannedEvent(
  data: unknown
): RealityScannedEvent | null {
  if (
    typeof data !== "object" ||
    data === null ||
    !("type" in data) ||
    data.type !== REALITY_SCANNED_TYPE
  ) {
    return null;
  }

  return {
    type: REALITY_SCANNED_TYPE,
    targetId:
      "targetId" in data && typeof data.targetId === "string"
        ? data.targetId
        : "",
    name: "name" in data && typeof data.name === "string" ? data.name : "",
    patchesCreated:
      "patchesCreated" in data && typeof data.patchesCreated === "number"
        ? data.patchesCreated
        : 0,
    patchedSectionKeys:
      "patchedSectionKeys" in data && Array.isArray(data.patchedSectionKeys)
        ? data.patchedSectionKeys.filter(
            (item): item is string => typeof item === "string"
          )
        : [],
    skipped:
      "skipped" in data && typeof data.skipped === "number" ? data.skipped : 0,
    llmCalled:
      "llmCalled" in data && typeof data.llmCalled === "boolean"
        ? data.llmCalled
        : false,
    message:
      "message" in data && typeof data.message === "string" ? data.message : "",
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
