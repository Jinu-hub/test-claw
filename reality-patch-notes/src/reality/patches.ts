import type { RealityStore } from "./store";
import type { PatchRow, PatchType } from "./types";

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
};

export function listPatches(
  store: RealityStore,
  targetId: string
): PatchSummary[] {
  const rows = store.sql<PatchRow>`
    SELECT
      id, target_id, section_key, type, title, summary,
      before_value, after_value, impact, created_at
    FROM patches
    WHERE target_id = ${targetId}
    ORDER BY created_at DESC
  `;

  return rows.map((row) => {
    const links = store.sql<{ evidence_id: string }>`
      SELECT evidence_id FROM patch_evidences WHERE patch_id = ${row.id}
    `;
    return {
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
      evidenceIds: links.map((link) => link.evidence_id)
    };
  });
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

  return {
    id,
    targetId: input.targetId,
    sectionKey: input.sectionKey,
    type: input.type,
    title: input.title,
    summary: input.summary,
    before: input.before,
    after: input.after,
    impact: input.impact,
    createdAt,
    evidenceIds: [...input.evidenceIds]
  };
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
