import type { FetchedSource } from "./fetch";
import { fetchSourceText } from "./fetch";
import { getSourcePack, noSourcePackMessage } from "./sources";
import type { RealityStore } from "./store";
import type { EvidenceRow, TargetRow } from "./types";

export function evidenceObjectKey(
  targetId: string,
  evidenceId: string
): string {
  return `targets/${targetId}/evidence/${evidenceId}.txt`;
}

export async function hashContent(text: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(text)
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function summarizeText(text: string, maxChars = 280): string {
  const compact = text.replace(/\s+/g, " ").trim();
  if (compact.length <= maxChars) return compact;
  return `${compact.slice(0, maxChars - 1).trim()}…`;
}

export function listEvidences(
  store: RealityStore,
  targetId: string
): EvidenceRow[] {
  return store.sql<EvidenceRow>`
    SELECT
      id, target_id, url, title, publisher, source_type, published_at,
      observed_at, summary, content_hash, r2_object_key, compared_at
    FROM evidences
    WHERE target_id = ${targetId}
    ORDER BY observed_at DESC
  `;
}

export function findEvidenceByHash(
  store: RealityStore,
  targetId: string,
  contentHash: string
): EvidenceRow | null {
  const rows = store.sql<EvidenceRow>`
    SELECT
      id, target_id, url, title, publisher, source_type, published_at,
      observed_at, summary, content_hash, r2_object_key, compared_at
    FROM evidences
    WHERE target_id = ${targetId} AND content_hash = ${contentHash}
    LIMIT 1
  `;
  return rows[0] ?? null;
}

export function summarizeEvidence(row: EvidenceRow) {
  return {
    id: row.id,
    targetId: row.target_id,
    url: row.url,
    title: row.title,
    publisher: row.publisher,
    sourceType: row.source_type,
    observedAt: row.observed_at,
    comparedAt: row.compared_at,
    summary: row.summary,
    contentHash: row.content_hash,
    objectKey: row.r2_object_key
  };
}

export function listUncomparedEvidences(
  store: RealityStore,
  targetId: string
): EvidenceRow[] {
  return store.sql<EvidenceRow>`
    SELECT
      id, target_id, url, title, publisher, source_type, published_at,
      observed_at, summary, content_hash, r2_object_key, compared_at
    FROM evidences
    WHERE target_id = ${targetId} AND compared_at IS NULL
    ORDER BY observed_at ASC
  `;
}

export function markEvidenceCompared(
  store: RealityStore,
  evidenceIds: string[],
  comparedAt = new Date().toISOString()
): void {
  for (const evidenceId of evidenceIds) {
    store.sql`
      UPDATE evidences
      SET compared_at = ${comparedAt}
      WHERE id = ${evidenceId}
    `;
  }
}

export function markUncomparedEvidenceCompared(
  store: RealityStore,
  targetId: string,
  comparedAt = new Date().toISOString()
): void {
  store.sql`
    UPDATE evidences
    SET compared_at = ${comparedAt}
    WHERE target_id = ${targetId} AND compared_at IS NULL
  `;
}

export async function loadEvidenceText(
  store: RealityStore,
  row: EvidenceRow
): Promise<string> {
  if (row.r2_object_key) {
    const object = await store.bucket.get(row.r2_object_key);
    if (object) {
      const text = (await object.text()).trim();
      if (text) return text;
    }
  }
  return (row.summary ?? "").trim();
}

export type IngestEvidenceResult =
  | {
      stored: true;
      skipped: false;
      evidence: ReturnType<typeof summarizeEvidence>;
    }
  | {
      stored: false;
      skipped: true;
      reason: "duplicate_hash";
      evidence: ReturnType<typeof summarizeEvidence>;
    };

export async function ingestFetchedEvidence(
  store: RealityStore,
  targetId: string,
  source: FetchedSource,
  options?: { storeRaw?: boolean }
): Promise<
  IngestEvidenceResult | { stored: false; skipped: false; error: string }
> {
  if (!source.ok || !source.text.trim()) {
    return {
      stored: false,
      skipped: false,
      error: source.error || "Empty source text"
    };
  }

  const contentHash = await hashContent(source.text);
  const existing = findEvidenceByHash(store, targetId, contentHash);
  if (existing) {
    return {
      stored: false,
      skipped: true,
      reason: "duplicate_hash",
      evidence: summarizeEvidence(existing)
    };
  }

  const evidenceId = `ev_${targetId}_${contentHash.slice(0, 12)}`;
  const now = new Date().toISOString();
  const summary = summarizeText(source.text);
  const storeRaw = options?.storeRaw ?? true;
  let objectKey: string | null = null;

  if (storeRaw) {
    objectKey = evidenceObjectKey(targetId, evidenceId);
    await store.bucket.put(objectKey, source.text, {
      httpMetadata: { contentType: "text/plain; charset=utf-8" }
    });
  }

  store.sql`
    INSERT INTO evidences (
      id, target_id, url, title, publisher, source_type, published_at,
      observed_at, summary, content_hash, r2_object_key, compared_at
    ) VALUES (
      ${evidenceId},
      ${targetId},
      ${source.url},
      ${source.title},
      ${source.publisher},
      ${source.sourceType},
      ${null},
      ${now},
      ${summary},
      ${contentHash},
      ${objectKey},
      ${null}
    )
  `;

  const row = findEvidenceByHash(store, targetId, contentHash);
  if (!row) {
    throw new Error(`Failed to store evidence ${evidenceId}`);
  }

  return {
    stored: true,
    skipped: false,
    evidence: summarizeEvidence(row)
  };
}

export async function persistFetchedEvidence(
  store: RealityStore,
  targetId: string,
  sources: FetchedSource[]
): Promise<{ stored: number; skipped: number; failed: number }> {
  let stored = 0;
  let skipped = 0;
  let failed = 0;

  for (const source of sources) {
    const result = await ingestFetchedEvidence(store, targetId, source);
    if ("error" in result) {
      failed += 1;
      continue;
    }
    if (result.skipped) skipped += 1;
    else stored += 1;
  }

  return { stored, skipped, failed };
}

export async function collectCanonicalEvidence(
  store: RealityStore,
  target: TargetRow
): Promise<{
  targetId: string;
  name: string;
  stored: number;
  skipped: number;
  failed: number;
  evidences: ReturnType<typeof summarizeEvidence>[];
  skippedEvidences: ReturnType<typeof summarizeEvidence>[];
}> {
  const pack = getSourcePack(target);
  if (!pack) {
    throw new Error(noSourcePackMessage(target.name));
  }

  const skippedEvidences: ReturnType<typeof summarizeEvidence>[] = [];
  const storedEvidences: ReturnType<typeof summarizeEvidence>[] = [];
  let failed = 0;

  for (const source of pack.sources) {
    const fetched = await fetchSourceText(source);
    const result = await ingestFetchedEvidence(store, target.id, fetched);
    if ("error" in result) {
      failed += 1;
      continue;
    }
    if (result.skipped) skippedEvidences.push(result.evidence);
    else storedEvidences.push(result.evidence);
  }

  return {
    targetId: target.id,
    name: target.name,
    stored: storedEvidences.length,
    skipped: skippedEvidences.length,
    failed,
    evidences: storedEvidences,
    skippedEvidences
  };
}

export async function deleteEvidenceObjects(
  store: RealityStore,
  targetId: string
): Promise<void> {
  const rows = listEvidences(store, targetId);
  const keys = rows
    .map((row) => row.r2_object_key)
    .filter((key): key is string => Boolean(key));
  if (keys.length > 0) {
    await store.bucket.delete(keys);
  }
}
