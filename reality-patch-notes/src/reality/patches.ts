import type { RealityStore } from "./store";
import type { EvidenceRow, PatchRow, PatchType } from "./types";

export type PatchEvidenceRef = {
  id: string;
  url: string;
  title: string;
};

export type PatchSummary = {
  id: string;
  targetId: string;
  sectionKey: string;
  type: string;
  title: string;
  summary: string;
  before: string | null;
  after: string | null;
  impact: string | null;
  createdAt: string;
  evidenceIds: string[];
  evidences: PatchEvidenceRef[];
};

export type PatchQuery = {
  targetId: string;
  sectionKey?: string;
  since?: string;
  until?: string;
  limit?: number;
};

function getEvidenceById(
  store: RealityStore,
  evidenceId: string
): EvidenceRow | null {
  const rows = store.sql<EvidenceRow>`
    SELECT
      id, target_id, url, title, publisher, source_type, published_at,
      observed_at, summary, content_hash, r2_object_key, compared_at
    FROM evidences
    WHERE id = ${evidenceId}
    LIMIT 1
  `;
  return rows[0] ?? null;
}

function attachEvidenceDetails(
  store: RealityStore,
  patch: Omit<PatchSummary, "evidences">
): PatchSummary {
  const evidences = patch.evidenceIds.flatMap((evidenceId) => {
    const row = getEvidenceById(store, evidenceId);
    if (!row) return [];
    return [{ id: row.id, url: row.url, title: row.title }];
  });

  return { ...patch, evidences };
}

function mapPatchRow(store: RealityStore, row: PatchRow): PatchSummary {
  const links = store.sql<{ evidence_id: string }>`
    SELECT evidence_id FROM patch_evidences WHERE patch_id = ${row.id}
  `;
  const evidenceIds = links.map((link) => link.evidence_id);

  return attachEvidenceDetails(store, {
    id: row.id,
    targetId: row.target_id,
    sectionKey: row.section_key,
    type: row.type,
    title: row.title,
    summary: row.summary,
    before: row.before_value,
    after: row.after_value,
    impact: row.impact,
    createdAt: row.created_at,
    evidenceIds
  });
}

function fetchPatchRows(store: RealityStore, query: PatchQuery): PatchRow[] {
  const limit = query.limit ?? 50;
  const sectionKey = query.sectionKey?.trim() || null;
  const since = query.since?.trim() || null;
  const until = query.until?.trim() || null;

  if (sectionKey && since && until) {
    return store.sql<PatchRow>`
      SELECT
        id, target_id, section_key, type, title, summary,
        before_value, after_value, impact, created_at
      FROM patches
      WHERE target_id = ${query.targetId}
        AND section_key = ${sectionKey}
        AND created_at >= ${since}
        AND created_at <= ${until}
      ORDER BY created_at DESC
      LIMIT ${limit}
    `;
  }

  if (sectionKey && since) {
    return store.sql<PatchRow>`
      SELECT
        id, target_id, section_key, type, title, summary,
        before_value, after_value, impact, created_at
      FROM patches
      WHERE target_id = ${query.targetId}
        AND section_key = ${sectionKey}
        AND created_at >= ${since}
      ORDER BY created_at DESC
      LIMIT ${limit}
    `;
  }

  if (sectionKey && until) {
    return store.sql<PatchRow>`
      SELECT
        id, target_id, section_key, type, title, summary,
        before_value, after_value, impact, created_at
      FROM patches
      WHERE target_id = ${query.targetId}
        AND section_key = ${sectionKey}
        AND created_at <= ${until}
      ORDER BY created_at DESC
      LIMIT ${limit}
    `;
  }

  if (since && until) {
    return store.sql<PatchRow>`
      SELECT
        id, target_id, section_key, type, title, summary,
        before_value, after_value, impact, created_at
      FROM patches
      WHERE target_id = ${query.targetId}
        AND created_at >= ${since}
        AND created_at <= ${until}
      ORDER BY created_at DESC
      LIMIT ${limit}
    `;
  }

  if (since) {
    return store.sql<PatchRow>`
      SELECT
        id, target_id, section_key, type, title, summary,
        before_value, after_value, impact, created_at
      FROM patches
      WHERE target_id = ${query.targetId}
        AND created_at >= ${since}
      ORDER BY created_at DESC
      LIMIT ${limit}
    `;
  }

  if (until) {
    return store.sql<PatchRow>`
      SELECT
        id, target_id, section_key, type, title, summary,
        before_value, after_value, impact, created_at
      FROM patches
      WHERE target_id = ${query.targetId}
        AND created_at <= ${until}
      ORDER BY created_at DESC
      LIMIT ${limit}
    `;
  }

  if (sectionKey) {
    return store.sql<PatchRow>`
      SELECT
        id, target_id, section_key, type, title, summary,
        before_value, after_value, impact, created_at
      FROM patches
      WHERE target_id = ${query.targetId}
        AND section_key = ${sectionKey}
      ORDER BY created_at DESC
      LIMIT ${limit}
    `;
  }

  return store.sql<PatchRow>`
    SELECT
      id, target_id, section_key, type, title, summary,
      before_value, after_value, impact, created_at
    FROM patches
    WHERE target_id = ${query.targetId}
    ORDER BY created_at DESC
    LIMIT ${limit}
  `;
}

export function queryPatches(
  store: RealityStore,
  query: PatchQuery
): PatchSummary[] {
  return fetchPatchRows(store, query).map((row) => mapPatchRow(store, row));
}

export function listPatches(
  store: RealityStore,
  targetId: string
): PatchSummary[] {
  return queryPatches(store, { targetId });
}

export function insertPatch(
  store: RealityStore,
  input: {
    targetId: string;
    sectionKey: string;
    type: PatchType;
    title: string;
    summary: string;
    before: string;
    after: string;
    impact: string;
    evidenceIds: string[];
  }
): PatchSummary {
  const id = `patch_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
  const createdAt = new Date().toISOString();

  store.sql`
    INSERT INTO patches (
      id, target_id, section_key, type, title, summary,
      before_value, after_value, impact, created_at
    ) VALUES (
      ${id},
      ${input.targetId},
      ${input.sectionKey},
      ${input.type},
      ${input.title},
      ${input.summary},
      ${input.before},
      ${input.after},
      ${input.impact},
      ${createdAt}
    )
  `;

  for (const evidenceId of input.evidenceIds) {
    store.sql`
      INSERT OR IGNORE INTO patch_evidences (patch_id, evidence_id)
      VALUES (${id}, ${evidenceId})
    `;
  }

  return mapPatchRow(store, {
    id,
    target_id: input.targetId,
    section_key: input.sectionKey,
    type: input.type,
    title: input.title,
    summary: input.summary,
    before_value: input.before,
    after_value: input.after,
    impact: input.impact,
    created_at: createdAt
  });
}

export function insertScanRun(
  store: RealityStore,
  input: {
    targetId: string;
    status: string;
    notes: string;
    startedAt?: string;
    finishedAt?: string | null;
  }
): string {
  const id = `scan_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
  const startedAt = input.startedAt ?? new Date().toISOString();
  const finishedAt = input.finishedAt ?? startedAt;

  store.sql`
    INSERT INTO scan_runs (
      id, target_id, status, started_at, finished_at, notes
    ) VALUES (
      ${id},
      ${input.targetId},
      ${input.status},
      ${startedAt},
      ${finishedAt},
      ${input.notes}
    )
  `;

  return id;
}
