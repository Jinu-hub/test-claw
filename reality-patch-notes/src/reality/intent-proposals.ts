import { reconcileIntent, setWatchIntent } from "./targets";
import type { RealityStore } from "./store";
import type { WatchIntent } from "./types";

export type IntentProposalStatus = "pending" | "accepted" | "rejected";

export type IntentProposalRow = {
  id: string;
  target_id: string;
  focus_json: string;
  ignore_json: string;
  priority_json: string;
  rationale: string;
  status: IntentProposalStatus;
  created_at: string;
  resolved_at: string | null;
};

export type IntentProposalSummary = {
  id: string;
  targetId: string;
  focus: string[];
  ignore: string[];
  priority: string[];
  rationale: string;
  status: IntentProposalStatus;
  createdAt: string;
  resolvedAt: string | null;
};

function parseStringList(json: string): string[] {
  try {
    const parsed = JSON.parse(json) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is string => typeof item === "string");
  } catch {
    return [];
  }
}

export function summarizeIntentProposal(
  row: IntentProposalRow
): IntentProposalSummary {
  return {
    id: row.id,
    targetId: row.target_id,
    focus: parseStringList(row.focus_json),
    ignore: parseStringList(row.ignore_json),
    priority: parseStringList(row.priority_json),
    rationale: row.rationale,
    status: row.status,
    createdAt: row.created_at,
    resolvedAt: row.resolved_at
  };
}

export function getIntentProposal(
  store: RealityStore,
  proposalId: string
): IntentProposalRow | null {
  const rows = store.sql<IntentProposalRow>`
    SELECT
      id, target_id, focus_json, ignore_json, priority_json,
      rationale, status, created_at, resolved_at
    FROM watch_intent_proposals
    WHERE id = ${proposalId}
    LIMIT 1
  `;
  return rows[0] ?? null;
}

export function findPendingIntentProposal(
  store: RealityStore,
  targetId: string
): IntentProposalRow | null {
  const rows = store.sql<IntentProposalRow>`
    SELECT
      id, target_id, focus_json, ignore_json, priority_json,
      rationale, status, created_at, resolved_at
    FROM watch_intent_proposals
    WHERE target_id = ${targetId} AND status = 'pending'
    ORDER BY created_at DESC
    LIMIT 1
  `;
  return rows[0] ?? null;
}

export function listIntentProposals(
  store: RealityStore,
  targetId: string,
  status?: IntentProposalStatus
): IntentProposalSummary[] {
  if (status) {
    return store
      .sql<IntentProposalRow>`
        SELECT
          id, target_id, focus_json, ignore_json, priority_json,
          rationale, status, created_at, resolved_at
        FROM watch_intent_proposals
        WHERE target_id = ${targetId} AND status = ${status}
        ORDER BY created_at DESC
      `
      .map(summarizeIntentProposal);
  }

  return store
    .sql<IntentProposalRow>`
      SELECT
        id, target_id, focus_json, ignore_json, priority_json,
        rationale, status, created_at, resolved_at
      FROM watch_intent_proposals
      WHERE target_id = ${targetId}
      ORDER BY created_at DESC
    `
    .map(summarizeIntentProposal);
}

export function listPendingIntentProposals(
  store: RealityStore,
  targetId: string
): IntentProposalSummary[] {
  return listIntentProposals(store, targetId, "pending");
}

export function upsertPendingIntentProposal(
  store: RealityStore,
  input: {
    targetId: string;
    focus: string[];
    ignore: string[];
    priority: string[];
    rationale: string;
  }
): IntentProposalSummary {
  const intent = reconcileIntent({
    focus: input.focus,
    ignore: input.ignore,
    priority: input.priority.length > 0 ? input.priority : input.focus
  });
  const existing = findPendingIntentProposal(store, input.targetId);
  const now = new Date().toISOString();
  const focusJson = JSON.stringify(intent.focus);
  const ignoreJson = JSON.stringify(intent.ignore);
  const priorityJson = JSON.stringify(intent.priority);

  if (existing) {
    store.sql`
      UPDATE watch_intent_proposals
      SET
        focus_json = ${focusJson},
        ignore_json = ${ignoreJson},
        priority_json = ${priorityJson},
        rationale = ${input.rationale.trim()},
        created_at = ${now}
      WHERE id = ${existing.id}
    `;
    const updated = getIntentProposal(store, existing.id);
    if (!updated) {
      throw new Error(`Failed to update intent proposal ${existing.id}`);
    }
    return summarizeIntentProposal(updated);
  }

  const id = `intent_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
  store.sql`
    INSERT INTO watch_intent_proposals (
      id, target_id, focus_json, ignore_json, priority_json,
      rationale, status, created_at, resolved_at
    ) VALUES (
      ${id},
      ${input.targetId},
      ${focusJson},
      ${ignoreJson},
      ${priorityJson},
      ${input.rationale.trim()},
      ${"pending"},
      ${now},
      ${null}
    )
  `;

  const row = getIntentProposal(store, id);
  if (!row) throw new Error(`Failed to insert intent proposal ${id}`);
  return summarizeIntentProposal(row);
}

export async function acceptIntentProposal(
  store: RealityStore,
  targetId: string,
  proposalId: string
): Promise<
  | {
      accepted: true;
      proposal: IntentProposalSummary;
      intent: WatchIntent;
    }
  | { accepted: false; message: string }
> {
  const row = getIntentProposal(store, proposalId);
  if (!row || row.target_id !== targetId) {
    return { accepted: false, message: "Intent proposal not found for target." };
  }
  if (row.status !== "pending") {
    return {
      accepted: false,
      message: `Intent proposal is already ${row.status}.`
    };
  }

  const summary = summarizeIntentProposal(row);
  const applied = await setWatchIntent(store, {
    targetId,
    focus: summary.focus,
    ignore: summary.ignore,
    priority: summary.priority
  });
  if (!applied.updated) {
    return { accepted: false, message: applied.message };
  }

  const now = new Date().toISOString();
  store.sql`
    UPDATE watch_intent_proposals
    SET status = ${"accepted"}, resolved_at = ${now}
    WHERE id = ${row.id}
  `;

  const updated = getIntentProposal(store, row.id);
  return {
    accepted: true,
    proposal: summarizeIntentProposal(
      updated ?? { ...row, status: "accepted", resolved_at: now }
    ),
    intent: applied.intent
  };
}

export function rejectIntentProposal(
  store: RealityStore,
  targetId: string,
  proposalId: string
):
  | { rejected: true; proposal: IntentProposalSummary }
  | { rejected: false; message: string } {
  const row = getIntentProposal(store, proposalId);
  if (!row || row.target_id !== targetId) {
    return { rejected: false, message: "Intent proposal not found for target." };
  }
  if (row.status !== "pending") {
    return {
      rejected: false,
      message: `Intent proposal is already ${row.status}.`
    };
  }

  const now = new Date().toISOString();
  store.sql`
    UPDATE watch_intent_proposals
    SET status = ${"rejected"}, resolved_at = ${now}
    WHERE id = ${row.id}
  `;

  const updated = getIntentProposal(store, row.id);
  return {
    rejected: true,
    proposal: summarizeIntentProposal(
      updated ?? { ...row, status: "rejected", resolved_at: now }
    )
  };
}

/** Apply user-edited Focus/Ignore/Priority and mark the pending proposal accepted. */
export async function applyIntentDraft(
  store: RealityStore,
  input: {
    targetId: string;
    proposalId: string;
    focus: string[];
    ignore: string[];
    priority: string[];
  }
): Promise<
  | { applied: true; intent: WatchIntent; proposal: IntentProposalSummary }
  | { applied: false; message: string }
> {
  const row = getIntentProposal(store, input.proposalId);
  if (!row || row.target_id !== input.targetId) {
    return { applied: false, message: "Intent proposal not found for target." };
  }
  if (row.status !== "pending") {
    return {
      applied: false,
      message: `Intent proposal is already ${row.status}.`
    };
  }

  const applied = await setWatchIntent(store, {
    targetId: input.targetId,
    focus: input.focus,
    ignore: input.ignore,
    priority: input.priority.length > 0 ? input.priority : input.focus
  });
  if (!applied.updated) {
    return { applied: false, message: applied.message };
  }

  const now = new Date().toISOString();
  store.sql`
    UPDATE watch_intent_proposals
    SET status = ${"accepted"}, resolved_at = ${now}
    WHERE id = ${row.id}
  `;

  const updated = getIntentProposal(store, row.id);
  return {
    applied: true,
    intent: applied.intent,
    proposal: summarizeIntentProposal(
      updated ?? { ...row, status: "accepted", resolved_at: now }
    )
  };
}
