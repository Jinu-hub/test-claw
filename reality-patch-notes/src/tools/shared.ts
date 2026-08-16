export const SCHEDULED_TASK_TYPE = "scheduled-task";
export const REALITY_INITIALIZED_TYPE = "reality-initialized";
export const REALITY_SCANNED_TYPE = "reality-scanned";
export const REALITY_ACTIVITY_CHANGED_TYPE = "reality-activity-changed";
export const WORKFLOW_PROGRESS_TYPE = "workflow-progress";

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
  proposalsCreated: number;
  proposedSectionKeys: string[];
  skipped: number;
  llmCalled: boolean;
  message: string;
  timestamp: string;
};

export type RealityActivityChangedEvent = {
  type: typeof REALITY_ACTIVITY_CHANGED_TYPE;
  targetId: string;
  reason: string;
  timestamp: string;
};

export type WorkflowProgressPayload = {
  step?: string;
  status?: string;
  percent?: number;
  targetId?: string;
  name?: string;
  message?: string;
  packId?: string;
  patchesCreated?: number;
  proposalsCreated?: number;
  sectionKeys?: string[];
};

export type WorkflowProgressEvent = {
  type: typeof WORKFLOW_PROGRESS_TYPE;
  workflowName: string;
  instanceId: string;
  progress: WorkflowProgressPayload;
  timestamp: string;
};

export function workflowKindLabel(workflowName: string): string {
  if (workflowName === "SCAN_TARGET_WORKFLOW") return "Scan";
  if (workflowName === "INITIALIZE_REALITY_WORKFLOW")
    return "Initialize Reality";
  return workflowName;
}

export function workflowStepLabel(step: string | undefined): string {
  switch (step) {
    case "queued":
      return "Queued";
    case "start":
      return "Starting";
    case "prepared":
      return "Prepared";
    case "scan-and-patch":
    case "build-and-save":
      return "Working";
    case "complete":
      return "Finishing";
    default:
      return step ? step.replace(/-/g, " ") : "Running";
  }
}

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
    proposalsCreated:
      "proposalsCreated" in data && typeof data.proposalsCreated === "number"
        ? data.proposalsCreated
        : 0,
    proposedSectionKeys:
      "proposedSectionKeys" in data && Array.isArray(data.proposedSectionKeys)
        ? data.proposedSectionKeys.filter(
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

export function parseRealityActivityChangedEvent(
  data: unknown
): RealityActivityChangedEvent | null {
  if (
    typeof data !== "object" ||
    data === null ||
    !("type" in data) ||
    data.type !== REALITY_ACTIVITY_CHANGED_TYPE
  ) {
    return null;
  }

  return {
    type: REALITY_ACTIVITY_CHANGED_TYPE,
    targetId:
      "targetId" in data && typeof data.targetId === "string"
        ? data.targetId
        : "",
    reason:
      "reason" in data && typeof data.reason === "string" ? data.reason : "",
    timestamp:
      "timestamp" in data && typeof data.timestamp === "string"
        ? data.timestamp
        : new Date().toISOString()
  };
}

export function parseWorkflowProgressEvent(
  data: unknown
): WorkflowProgressEvent | null {
  if (
    typeof data !== "object" ||
    data === null ||
    !("type" in data) ||
    data.type !== WORKFLOW_PROGRESS_TYPE
  ) {
    return null;
  }

  const progressRaw =
    "progress" in data && typeof data.progress === "object" && data.progress
      ? (data.progress as Record<string, unknown>)
      : {};

  return {
    type: WORKFLOW_PROGRESS_TYPE,
    workflowName:
      "workflowName" in data && typeof data.workflowName === "string"
        ? data.workflowName
        : "",
    instanceId:
      "instanceId" in data && typeof data.instanceId === "string"
        ? data.instanceId
        : "",
    progress: {
      step: typeof progressRaw.step === "string" ? progressRaw.step : undefined,
      status:
        typeof progressRaw.status === "string" ? progressRaw.status : undefined,
      percent:
        typeof progressRaw.percent === "number"
          ? progressRaw.percent
          : undefined,
      targetId:
        typeof progressRaw.targetId === "string"
          ? progressRaw.targetId
          : undefined,
      name: typeof progressRaw.name === "string" ? progressRaw.name : undefined,
      message:
        typeof progressRaw.message === "string"
          ? progressRaw.message
          : undefined,
      packId:
        typeof progressRaw.packId === "string" ? progressRaw.packId : undefined
    },
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
    payload: unknown,
    options?: { idempotent?: boolean }
  ): Promise<{ id: string } & Record<string, unknown>>;
  listSchedules(criteria?: {
    id?: string;
    type?: "scheduled" | "delayed" | "cron" | "interval";
  }): Promise<unknown[]>;
  /** @deprecated Prefer listSchedules */
  getSchedules(): unknown[];
  cancelSchedule(id: string): Promise<boolean>;
};
