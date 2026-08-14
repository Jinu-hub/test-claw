export type ScheduledScanPayload = {
  kind: "scan-target";
  targetId: string;
  name?: string;
};

export function createScheduledScanPayload(input: {
  targetId: string;
  name?: string;
}): ScheduledScanPayload {
  return {
    kind: "scan-target",
    targetId: input.targetId,
    name: input.name
  };
}

/** @deprecated Prefer createScheduledScanPayload and pass the object to schedule(). */
export function encodeScheduledScanPayload(
  payload: ScheduledScanPayload
): string {
  return JSON.stringify(payload);
}

export function parseScheduledTaskPayload(
  input: unknown
): ScheduledScanPayload | { kind: "unknown"; description: string } {
  if (typeof input === "object" && input !== null) {
    const parsed = input as Partial<ScheduledScanPayload>;
    if (parsed.kind === "scan-target" && typeof parsed.targetId === "string") {
      return {
        kind: "scan-target",
        targetId: parsed.targetId,
        name: typeof parsed.name === "string" ? parsed.name : undefined
      };
    }
  }

  if (typeof input === "string") {
    try {
      return parseScheduledTaskPayload(JSON.parse(input));
    } catch {
      return { kind: "unknown", description: input };
    }
  }

  return { kind: "unknown", description: String(input) };
}

export function isScheduledScanPayload(
  payload: ReturnType<typeof parseScheduledTaskPayload>
): payload is ScheduledScanPayload {
  return payload.kind === "scan-target";
}
