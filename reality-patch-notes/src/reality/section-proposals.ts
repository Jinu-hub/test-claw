import { addSection } from "./markdown";
import { insertPatch } from "./patches";
import {
  getCurrentContext,
  listTargets,
  parseWatchIntent,
  putCurrentContext,
  upsertTarget,
  type RealityStore
} from "./store";
import { normalizeIntentTerm } from "./targets";
import type { TargetRow, WatchIntent } from "./types";

export type SectionProposalStatus = "pending" | "accepted" | "rejected";

export type SectionProposalRow = {
  id: string;
  target_id: string;
  section_key: string;
  title: string;
  body: string;
  summary: string;
  evidence_ids_json: string;
  status: SectionProposalStatus;
  created_at: string;
  resolved_at: string | null;
};

export type SectionProposalSummary = {
  id: string;
  targetId: string;
  sectionKey: string;
  title: string;
  body: string;
  summary: string;
  evidenceIds: string[];
  status: SectionProposalStatus;
  createdAt: string;
  resolvedAt: string | null;
};

function parseEvidenceIds(json: string): string[] {
  try {
    const parsed = JSON.parse(json) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is string => typeof item === "string");
  } catch {
    return [];
  }
}

export function summarizeSectionProposal(
  row: SectionProposalRow
): SectionProposalSummary {
  return {
    id: row.id,
    targetId: row.target_id,
    sectionKey: row.section_key,
    title: row.title,
    body: row.body,
    summary: row.summary,
    evidenceIds: parseEvidenceIds(row.evidence_ids_json),
    status: row.status,
    createdAt: row.created_at,
    resolvedAt: row.resolved_at
  };
}

export function getSectionProposal(
  store: RealityStore,
  proposalId: string
): SectionProposalRow | null {
  const rows = store.sql<SectionProposalRow>`
    SELECT
      id, target_id, section_key, title, body, summary,
      evidence_ids_json, status, created_at, resolved_at
    FROM section_proposals
    WHERE id = ${proposalId}
    LIMIT 1
  `;
  return rows[0] ?? null;
}

export function findPendingProposal(
  store: RealityStore,
  targetId: string,
  sectionKey: string
): SectionProposalRow | null {
  const rows = store.sql<SectionProposalRow>`
    SELECT
      id, target_id, section_key, title, body, summary,
      evidence_ids_json, status, created_at, resolved_at
    FROM section_proposals
    WHERE target_id = ${targetId}
      AND section_key = ${sectionKey}
      AND status = 'pending'
    LIMIT 1
  `;
  return rows[0] ?? null;
}

export function listSectionProposals(
  store: RealityStore,
  targetId: string,
  status?: SectionProposalStatus
): SectionProposalSummary[] {
  if (status) {
    return store.sql<SectionProposalRow>`
        SELECT
          id, target_id, section_key, title, body, summary,
          evidence_ids_json, status, created_at, resolved_at
        FROM section_proposals
        WHERE target_id = ${targetId} AND status = ${status}
        ORDER BY created_at DESC
      `.map(summarizeSectionProposal);
  }

  return store.sql<SectionProposalRow>`
      SELECT
        id, target_id, section_key, title, body, summary,
        evidence_ids_json, status, created_at, resolved_at
      FROM section_proposals
      WHERE target_id = ${targetId}
      ORDER BY created_at DESC
    `.map(summarizeSectionProposal);
}

export function listPendingProposals(
  store: RealityStore,
  targetId: string
): SectionProposalSummary[] {
  return listSectionProposals(store, targetId, "pending");
}

/**
 * Insert a pending proposal, or refresh an existing pending one for the same key.
 */
export function upsertPendingProposal(
  store: RealityStore,
  input: {
    targetId: string;
    sectionKey: string;
    title: string;
    body: string;
    summary: string;
    evidenceIds: string[];
  }
): SectionProposalSummary {
  const sectionKey = input.sectionKey.trim().toLowerCase();
  const existing = findPendingProposal(store, input.targetId, sectionKey);
  const evidenceJson = JSON.stringify(input.evidenceIds);
  const now = new Date().toISOString();

  if (existing) {
    store.sql`
      UPDATE section_proposals
      SET
        title = ${input.title.trim()},
        body = ${input.body.trim()},
        summary = ${input.summary.trim()},
        evidence_ids_json = ${evidenceJson},
        created_at = ${now}
      WHERE id = ${existing.id}
    `;
    const updated = getSectionProposal(store, existing.id);
    if (!updated) throw new Error(`Failed to update proposal ${existing.id}`);
    return summarizeSectionProposal(updated);
  }

  const id = `prop_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
  store.sql`
    INSERT INTO section_proposals (
      id, target_id, section_key, title, body, summary,
      evidence_ids_json, status, created_at, resolved_at
    ) VALUES (
      ${id},
      ${input.targetId},
      ${sectionKey},
      ${input.title.trim()},
      ${input.body.trim()},
      ${input.summary.trim()},
      ${evidenceJson},
      ${"pending"},
      ${now},
      ${null}
    )
  `;

  const row = getSectionProposal(store, id);
  if (!row) throw new Error(`Failed to insert proposal ${id}`);
  return summarizeSectionProposal(row);
}

function intentIncludesTerm(list: string[], term: string): boolean {
  const normalized = normalizeIntentTerm(term).toLowerCase();
  if (!normalized) return true;
  return list.some(
    (item) => normalizeIntentTerm(item).toLowerCase() === normalized
  );
}

function withFocusTerm(intent: WatchIntent, term: string): WatchIntent {
  const label = term.trim();
  if (!label || intentIncludesTerm(intent.focus, label)) return intent;
  return {
    ...intent,
    focus: [...intent.focus, label]
  };
}

export async function acceptSectionProposal(
  store: RealityStore,
  target: TargetRow,
  proposalId: string
): Promise<
  | {
      accepted: true;
      proposal: SectionProposalSummary;
      objectKey: string;
      patchId: string;
    }
  | { accepted: false; message: string }
> {
  const row = getSectionProposal(store, proposalId);
  if (!row || row.target_id !== target.id) {
    return { accepted: false, message: "Proposal not found for this target." };
  }
  if (row.status !== "pending") {
    return {
      accepted: false,
      message: `Proposal is already ${row.status}.`
    };
  }

  const context = await getCurrentContext(store, target.id);
  if (!context) {
    return { accepted: false, message: "No Reality Context found in R2." };
  }

  const now = new Date().toISOString();
  const next = addSection(
    context,
    {
      key: row.section_key,
      title: row.title,
      body: row.body
    },
    now
  );
  if (!next) {
    return {
      accepted: false,
      message: `Cannot add section "${row.section_key}" (invalid key or already exists).`
    };
  }

  const intent = withFocusTerm(
    parseWatchIntent(target.watch_intent_json),
    row.title
  );
  next.intent = intent;
  next.profile.lastUpdated = now;

  const objectKey = await putCurrentContext(store, next);
  const evidenceIds = parseEvidenceIds(row.evidence_ids_json);
  const patch = insertPatch(store, {
    targetId: target.id,
    sectionKey: row.section_key,
    type: "ADDED",
    title: row.title,
    summary: row.summary,
    before: "(section did not exist)",
    after: row.body.slice(0, 400),
    impact: "New Reality section accepted from scan proposal.",
    evidenceIds
  });

  store.sql`
    UPDATE section_proposals
    SET status = ${"accepted"}, resolved_at = ${now}
    WHERE id = ${row.id}
  `;

  upsertTarget(store, {
    id: target.id,
    name: target.name,
    description: target.description,
    category: target.category,
    status: target.status,
    intent,
    createdAt: target.created_at,
    updatedAt: now
  });

  const updated = getSectionProposal(store, row.id);
  return {
    accepted: true,
    proposal: summarizeSectionProposal(
      updated ?? { ...row, status: "accepted", resolved_at: now }
    ),
    objectKey,
    patchId: patch.id
  };
}

/**
 * Backfill Watch Intent focus with titles of already-accepted section proposals.
 * Keeps Focus aligned with Reality sections the user chose to track.
 */
export async function syncAcceptedProposalsIntoFocus(
  store: RealityStore
): Promise<void> {
  for (const target of listTargets(store)) {
    const accepted = listSectionProposals(store, target.id, "accepted");
    if (accepted.length === 0) continue;

    let intent = parseWatchIntent(target.watch_intent_json);
    let changed = false;
    for (const proposal of accepted) {
      const before = intent.focus.length;
      intent = withFocusTerm(intent, proposal.title);
      if (intent.focus.length !== before) changed = true;
    }
    if (!changed) continue;

    const now = new Date().toISOString();
    upsertTarget(store, {
      id: target.id,
      name: target.name,
      description: target.description,
      category: target.category,
      status: target.status,
      intent,
      createdAt: target.created_at,
      updatedAt: now
    });

    const context = await getCurrentContext(store, target.id);
    if (context) {
      context.intent = intent;
      context.profile.lastUpdated = now;
      await putCurrentContext(store, context);
    }
  }
}

export function rejectSectionProposal(
  store: RealityStore,
  targetId: string,
  proposalId: string
):
  | { rejected: true; proposal: SectionProposalSummary }
  | { rejected: false; message: string } {
  const row = getSectionProposal(store, proposalId);
  if (!row || row.target_id !== targetId) {
    return { rejected: false, message: "Proposal not found for this target." };
  }
  if (row.status !== "pending") {
    return {
      rejected: false,
      message: `Proposal is already ${row.status}.`
    };
  }

  const now = new Date().toISOString();
  store.sql`
    UPDATE section_proposals
    SET status = ${"rejected"}, resolved_at = ${now}
    WHERE id = ${row.id}
  `;

  const updated = getSectionProposal(store, row.id);
  return {
    rejected: true,
    proposal: summarizeSectionProposal(
      updated ?? { ...row, status: "rejected", resolved_at: now }
    )
  };
}
