import {
  currentContextObjectKey,
  parseRealityContext,
  serializeRealityContext
} from "./markdown";
import type { SqlExecutor } from "./schema";
import type {
  RealityContext,
  TargetRow,
  TargetStatus,
  WatchIntent
} from "./types";

export type RealityStore = {
  sql: SqlExecutor;
  bucket: R2Bucket;
};

const EMPTY_INTENT: WatchIntent = {
  focus: [],
  ignore: [],
  priority: []
};

export function parseWatchIntent(json: string): WatchIntent {
  try {
    const parsed = JSON.parse(json) as Partial<WatchIntent>;
    return {
      focus: Array.isArray(parsed.focus) ? parsed.focus : [],
      ignore: Array.isArray(parsed.ignore) ? parsed.ignore : [],
      priority: Array.isArray(parsed.priority) ? parsed.priority : []
    };
  } catch {
    return { ...EMPTY_INTENT };
  }
}

export function listTargets(store: RealityStore): TargetRow[] {
  return store.sql<TargetRow>`
    SELECT id, name, description, category, status, watch_intent_json, created_at, updated_at
    FROM targets
    ORDER BY created_at ASC
  `;
}

export function getTarget(
  store: RealityStore,
  targetId: string
): TargetRow | null {
  const rows = store.sql<TargetRow>`
    SELECT id, name, description, category, status, watch_intent_json, created_at, updated_at
    FROM targets
    WHERE id = ${targetId}
    LIMIT 1
  `;
  return rows[0] ?? null;
}

export function upsertTarget(
  store: RealityStore,
  input: {
    id: string;
    name: string;
    description: string;
    category: string;
    status?: TargetStatus;
    intent?: WatchIntent;
    createdAt?: string;
    updatedAt?: string;
  }
): TargetRow {
  const now = new Date().toISOString();
  const createdAt = input.createdAt ?? now;
  const updatedAt = input.updatedAt ?? now;
  const status = input.status ?? "active";
  const intent = input.intent ?? EMPTY_INTENT;
  const watchIntentJson = JSON.stringify(intent);

  store.sql`
    INSERT INTO targets (
      id, name, description, category, status, watch_intent_json, created_at, updated_at
    ) VALUES (
      ${input.id},
      ${input.name},
      ${input.description},
      ${input.category},
      ${status},
      ${watchIntentJson},
      ${createdAt},
      ${updatedAt}
    )
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      description = excluded.description,
      category = excluded.category,
      status = excluded.status,
      watch_intent_json = excluded.watch_intent_json,
      updated_at = excluded.updated_at
  `;

  const row = getTarget(store, input.id);
  if (!row) {
    throw new Error(`Failed to upsert target ${input.id}`);
  }
  return row;
}

export async function putCurrentContext(
  store: RealityStore,
  context: RealityContext
): Promise<string> {
  const key = currentContextObjectKey(context.targetId);
  const markdown = serializeRealityContext(context);
  await store.bucket.put(key, markdown, {
    httpMetadata: {
      contentType: "text/markdown; charset=utf-8"
    }
  });
  return key;
}

export async function getCurrentContextMarkdown(
  store: RealityStore,
  targetId: string
): Promise<string | null> {
  const object = await store.bucket.get(currentContextObjectKey(targetId));
  if (!object) return null;
  return object.text();
}

export async function getCurrentContext(
  store: RealityStore,
  targetId: string
): Promise<RealityContext | null> {
  const markdown = await getCurrentContextMarkdown(store, targetId);
  if (!markdown) return null;
  return parseRealityContext(markdown, targetId);
}
