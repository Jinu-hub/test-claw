/**
 * Sidebar activity aggregate — SQLite only, for @callable getTargetActivity.
 * Not used by chat tools; UI fetches via RPC (see TargetSidebar, useTargetData).
 */
import { listPendingProposals } from "./section-proposals";
import { findPendingIntentProposal } from "./intent-proposals";
import type { RealityStore } from "./store";
import type { ScanRunRow } from "./types";

export type ActivityPatchItem = {
  id: string;
  title: string;
  type: string;
  sectionKey: string;
  createdAt: string;
};

export type ActivityProposalItem = {
  id: string;
  title: string;
  sectionKey: string;
  createdAt: string;
};

export type ActivityLastScan = {
  id: string;
  status: string;
  startedAt: string;
  finishedAt: string | null;
  patchesCreated: number | null;
  proposalsCreated: number | null;
};

export type ActivityIntentProposalItem = {
  id: string;
  focus: string[];
  ignore: string[];
  priority: string[];
  rationale: string;
  createdAt: string;
};

export type TargetActivitySummary = {
  targetId: string;
  lastScan: ActivityLastScan | null;
  patchesToday: number;
  recentPatches: ActivityPatchItem[];
  pendingProposals: ActivityProposalItem[];
  pendingIntentProposal: ActivityIntentProposalItem | null;
};

function startOfTodayIso(): string {
  const now = new Date();
  const start = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    0,
    0,
    0,
    0
  );
  return start.toISOString();
}

function parseScanNotes(notes: string | null): {
  patchesCreated: number | null;
  proposalsCreated: number | null;
} {
  if (!notes) return { patchesCreated: null, proposalsCreated: null };
  try {
    const parsed = JSON.parse(notes) as {
      patchesCreated?: unknown;
      proposalsCreated?: unknown;
    };
    return {
      patchesCreated:
        typeof parsed.patchesCreated === "number"
          ? parsed.patchesCreated
          : null,
      proposalsCreated:
        typeof parsed.proposalsCreated === "number"
          ? parsed.proposalsCreated
          : null
    };
  } catch {
    return { patchesCreated: null, proposalsCreated: null };
  }
}

export function getTargetActivitySummary(
  store: RealityStore,
  targetId: string
): TargetActivitySummary {
  const scanRows = store.sql<ScanRunRow>`
    SELECT id, target_id, status, started_at, finished_at, notes
    FROM scan_runs
    WHERE target_id = ${targetId}
    ORDER BY started_at DESC
    LIMIT 1
  `;
  const scan = scanRows[0] ?? null;
  const parsedNotes = parseScanNotes(scan?.notes ?? null);

  const since = startOfTodayIso();
  const todayCountRows = store.sql<{ count: number }>`
    SELECT COUNT(*) as count
    FROM patches
    WHERE target_id = ${targetId} AND created_at >= ${since}
  `;
  const patchesToday = Number(todayCountRows[0]?.count ?? 0);

  const recentRows = store.sql<{
    id: string;
    title: string;
    type: string;
    section_key: string;
    created_at: string;
  }>`
    SELECT id, title, type, section_key, created_at
    FROM patches
    WHERE target_id = ${targetId}
    ORDER BY created_at DESC
    LIMIT 5
  `;

  const pending = listPendingProposals(store, targetId).slice(0, 5);
  const pendingIntent = findPendingIntentProposal(store, targetId);

  return {
    targetId,
    lastScan: scan
      ? {
          id: scan.id,
          status: scan.status,
          startedAt: scan.started_at,
          finishedAt: scan.finished_at,
          patchesCreated: parsedNotes.patchesCreated,
          proposalsCreated: parsedNotes.proposalsCreated
        }
      : null,
    patchesToday,
    recentPatches: recentRows.map((row) => ({
      id: row.id,
      title: row.title,
      type: row.type,
      sectionKey: row.section_key,
      createdAt: row.created_at
    })),
    pendingProposals: pending.map((proposal) => ({
      id: proposal.id,
      title: proposal.title,
      sectionKey: proposal.sectionKey,
      createdAt: proposal.createdAt
    })),
    pendingIntentProposal: pendingIntent
      ? {
          id: pendingIntent.id,
          focus: JSON.parse(pendingIntent.focus_json) as string[],
          ignore: JSON.parse(pendingIntent.ignore_json) as string[],
          priority: JSON.parse(pendingIntent.priority_json) as string[],
          rationale: pendingIntent.rationale,
          createdAt: pendingIntent.created_at
        }
      : null
  };
}
