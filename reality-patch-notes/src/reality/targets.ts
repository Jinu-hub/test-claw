import { deleteEvidenceObjects } from "./evidence";
import { currentContextObjectKey } from "./markdown";
import {
  getCurrentContext,
  getTarget,
  listTargets,
  parseWatchIntent,
  putCurrentContext,
  upsertTarget,
  type RealityStore
} from "./store";
import type { RealityContext, TargetRow, WatchIntent } from "./types";

const EMPTY_INTENT: WatchIntent = {
  focus: [],
  ignore: [],
  priority: []
};

export function slugifyTargetId(name: string): string {
  const ascii = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);

  if (ascii) return `target_${ascii}`;

  const bytes = new TextEncoder().encode(name.trim().toLowerCase());
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  const encoded = btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "")
    .slice(0, 32);

  return `target_${encoded || "untitled"}`;
}

export function findTargetByName(
  store: RealityStore,
  name: string
): TargetRow | null {
  const needle = name.trim().toLowerCase();
  if (!needle) return null;
  return (
    listTargets(store).find(
      (target) =>
        target.name.toLowerCase() === needle ||
        target.id.toLowerCase() === needle
    ) ?? null
  );
}

export function resolveTarget(
  store: RealityStore,
  input: { targetId?: string; name?: string }
): TargetRow | null {
  const targetId = input.targetId?.trim();
  const name = input.name?.trim();

  if (targetId) {
    const byId = getTarget(store, targetId);
    if (byId) return byId;
    const byIdAsName = findTargetByName(store, targetId);
    if (byIdAsName) return byIdAsName;
  }

  if (name) {
    return findTargetByName(store, name);
  }

  return null;
}

/** Prefer an explicit name/id; if omitted and exactly one target exists, use it. */
export function resolveTargetOrSingle(
  store: RealityStore,
  input: { targetId?: string; name?: string }
): { target: TargetRow } | { target: null; message: string } {
  const explicit = resolveTarget(store, input);
  if (explicit) return { target: explicit };

  const hasHint = Boolean(input.targetId?.trim() || input.name?.trim());
  if (hasHint) {
    return {
      target: null,
      message: "Target not found. Use listTargets to see stored targets."
    };
  }

  const all = listTargets(store);
  if (all.length === 1) return { target: all[0] };
  if (all.length === 0) {
    return { target: null, message: "No targets stored yet." };
  }

  return {
    target: null,
    message: `Multiple targets exist (${all.map((t) => t.name).join(", ")}). Provide name or targetId.`
  };
}

const INTENT_ALIASES: Record<string, string> = {
  가격: "price",
  "price movement": "price",
  "daily price": "price",
  "price changes": "price",
  규제: "regulation",
  regulations: "regulation",
  채택: "adoption",
  "institutional adoption": "institutional adoption"
};

export function normalizeIntentTerm(term: string): string {
  const trimmed = term.trim().replace(/\s+/g, " ");
  if (!trimmed) return "";
  const alias = INTENT_ALIASES[trimmed.toLowerCase()];
  return alias ?? trimmed;
}

export function normalizeIntentList(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    const normalized = normalizeIntentTerm(item);
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(normalized);
  }
  return out;
}

function applyIntentList(
  current: string[],
  incoming: string[] | undefined,
  mode: "replace" | "merge"
): string[] {
  if (incoming === undefined) return normalizeIntentList(current);
  if (mode === "merge") {
    return normalizeIntentList([...current, ...incoming]);
  }
  return normalizeIntentList(incoming);
}

export function allocateTargetId(store: RealityStore, name: string): string {
  const base = slugifyTargetId(name);
  if (!getTarget(store, base)) return base;

  let suffix = 2;
  while (getTarget(store, `${base}_${suffix}`)) {
    suffix += 1;
  }
  return `${base}_${suffix}`;
}

export function createUninitializedContext(input: {
  targetId: string;
  name: string;
  description?: string;
  category?: string;
  intent?: WatchIntent;
  now?: string;
}): RealityContext {
  const now = input.now ?? new Date().toISOString();
  const description =
    input.description?.trim() ||
    `Watch target for ${input.name}. Reality baseline is not initialized yet.`;

  return {
    targetId: input.targetId,
    name: input.name.trim(),
    profile: {
      description,
      category: input.category?.trim() || "general",
      created: now,
      lastUpdated: now
    },
    intent: input.intent ?? { ...EMPTY_INTENT },
    sections: [
      {
        key: "baseline",
        title: "Baseline",
        body: `Not yet initialized.

This target is registered, but initial research has not run.
Current Reality will be filled in a later phase.`
      }
    ],
    openQuestions: [
      "What canonical sources should define the first Reality baseline?",
      "Which sections should be created during initial research?"
    ]
  };
}

export function summarizeTarget(target: TargetRow) {
  return {
    id: target.id,
    name: target.name,
    description: target.description,
    category: target.category,
    status: target.status,
    intent: parseWatchIntent(target.watch_intent_json),
    createdAt: target.created_at,
    updatedAt: target.updated_at
  };
}

export async function addTarget(
  store: RealityStore,
  input: {
    name: string;
    description?: string;
    category?: string;
    focus?: string[];
    ignore?: string[];
    priority?: string[];
  }
): Promise<
  | {
      created: true;
      target: ReturnType<typeof summarizeTarget>;
      objectKey: string;
      initialized: false;
    }
  | {
      created: false;
      target: ReturnType<typeof summarizeTarget>;
      message: string;
    }
> {
  const name = input.name.trim();
  if (!name) {
    throw new Error("Target name is required.");
  }

  const existing = findTargetByName(store, name);
  if (existing) {
    return {
      created: false,
      target: summarizeTarget(existing),
      message: `Target "${existing.name}" already exists as ${existing.id}.`
    };
  }

  const intent: WatchIntent = {
    focus: normalizeIntentList(input.focus ?? []),
    ignore: normalizeIntentList(input.ignore ?? []),
    priority: normalizeIntentList(input.priority ?? [])
  };
  const targetId = allocateTargetId(store, name);
  const context = createUninitializedContext({
    targetId,
    name,
    description: input.description,
    category: input.category,
    intent
  });

  const target = upsertTarget(store, {
    id: targetId,
    name: context.name,
    description: context.profile.description,
    category: context.profile.category,
    status: "active",
    intent,
    createdAt: context.profile.created,
    updatedAt: context.profile.lastUpdated
  });
  const objectKey = await putCurrentContext(store, context);

  return {
    created: true,
    target: summarizeTarget(target),
    objectKey,
    initialized: false
  };
}

export async function removeTarget(
  store: RealityStore,
  input: { targetId?: string; name?: string }
): Promise<
  | { removed: true; target: ReturnType<typeof summarizeTarget> }
  | { removed: false; message: string }
> {
  const resolved = resolveTargetOrSingle(store, input);
  if (!resolved.target) {
    return {
      removed: false,
      message: resolved.message
    };
  }
  const target = resolved.target;

  await deleteEvidenceObjects(store, target.id);
  store.sql`DELETE FROM patches WHERE target_id = ${target.id}`;
  store.sql`DELETE FROM evidences WHERE target_id = ${target.id}`;
  store.sql`DELETE FROM scan_runs WHERE target_id = ${target.id}`;
  store.sql`DELETE FROM targets WHERE id = ${target.id}`;
  await store.bucket.delete(currentContextObjectKey(target.id));

  return {
    removed: true,
    target: summarizeTarget(target)
  };
}

export async function updateWatchIntent(
  store: RealityStore,
  input: {
    targetId?: string;
    name?: string;
    focus?: string[];
    ignore?: string[];
    priority?: string[];
    mode?: "replace" | "merge";
  }
): Promise<
  | {
      updated: true;
      target: ReturnType<typeof summarizeTarget>;
      intent: WatchIntent;
      mode: "replace" | "merge";
    }
  | { updated: false; message: string }
> {
  const resolved = resolveTargetOrSingle(store, input);
  if (!resolved.target) {
    return {
      updated: false,
      message: resolved.message
    };
  }
  const target = resolved.target;
  const mode = input.mode ?? "replace";

  if (
    input.focus === undefined &&
    input.ignore === undefined &&
    input.priority === undefined
  ) {
    return {
      updated: false,
      message: "Provide at least one of focus, ignore, or priority."
    };
  }

  const currentIntent = parseWatchIntent(target.watch_intent_json);
  const nextIntent = reconcileIntent({
    focus: applyIntentList(currentIntent.focus, input.focus, mode),
    ignore: applyIntentList(currentIntent.ignore, input.ignore, mode),
    priority: applyIntentList(currentIntent.priority, input.priority, mode)
  });
  const now = new Date().toISOString();

  const updated = upsertTarget(store, {
    id: target.id,
    name: target.name,
    description: target.description,
    category: target.category,
    status: target.status,
    intent: nextIntent,
    createdAt: target.created_at,
    updatedAt: now
  });

  const context = await getCurrentContext(store, target.id);
  if (context) {
    context.intent = nextIntent;
    context.profile.lastUpdated = now;
    await putCurrentContext(store, context);
  }

  return {
    updated: true,
    target: summarizeTarget(updated),
    intent: nextIntent,
    mode
  };
}

/**
 * Replace the full watch intent. Use for utterances like
 * "가격은 관심 없고 ETF, 규제만 봐줘".
 */
export async function setWatchIntent(
  store: RealityStore,
  input: {
    targetId?: string;
    name?: string;
    focus: string[];
    ignore: string[];
    priority?: string[];
  }
): Promise<
  | {
      updated: true;
      target: ReturnType<typeof summarizeTarget>;
      intent: WatchIntent;
      mode: "replace";
    }
  | { updated: false; message: string }
> {
  const result = await updateWatchIntent(store, {
    targetId: input.targetId,
    name: input.name,
    focus: input.focus,
    ignore: input.ignore,
    priority: input.priority ?? input.focus,
    mode: "replace"
  });
  if (!result.updated) return result;
  return { ...result, mode: "replace" };
}

function reconcileIntent(intent: WatchIntent): WatchIntent {
  const ignore = normalizeIntentList(intent.ignore);
  const ignoreKeys = new Set(ignore.map((item) => item.toLowerCase()));
  const focus = normalizeIntentList(intent.focus).filter(
    (item) => !ignoreKeys.has(item.toLowerCase())
  );
  const priority = normalizeIntentList(intent.priority).filter(
    (item) => !ignoreKeys.has(item.toLowerCase())
  );
  return { focus, ignore, priority };
}
