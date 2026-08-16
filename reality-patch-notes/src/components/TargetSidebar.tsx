import { ArrowsClockwiseIcon, CrosshairIcon } from "@phosphor-icons/react";
import { Button, Text } from "@cloudflare/kumo";

export type SidebarTarget = {
  id: string;
  name: string;
  description: string;
  category: string;
  status: string;
};

export type TargetActivitySummary = {
  targetId: string;
  lastScan: {
    id: string;
    status: string;
    startedAt: string;
    finishedAt: string | null;
    patchesCreated: number | null;
    proposalsCreated: number | null;
  } | null;
  patchesToday: number;
  recentPatches: Array<{
    id: string;
    title: string;
    type: string;
    sectionKey: string;
    createdAt: string;
  }>;
  pendingProposals: Array<{
    id: string;
    title: string;
    sectionKey: string;
    createdAt: string;
  }>;
};

/** Prefix attached to outbound chat text so the model prefers this target. */
export function withTargetFocus(
  text: string,
  target: SidebarTarget | null | undefined
): string {
  if (!target) return text;
  const body = text.trim();
  const focusLine = `⟦Focus: ${target.name} | ${target.id}⟧`;
  return body ? `${focusLine}\n${body}` : focusLine;
}

/** Hide the focus marker in the chat bubble. */
export function stripTargetFocus(text: string): string {
  return text.replace(/^⟦Focus: .+? \| .+?⟧\n?/, "");
}

function statusDotClass(status: string): string {
  if (status === "active") return "bg-kumo-success";
  if (status === "paused") return "bg-kumo-warning";
  return "bg-kumo-inactive";
}

function formatShortTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function lastScanLabel(
  activity: TargetActivitySummary | null,
  scanInProgress: boolean
): string {
  if (scanInProgress) return "Scanning…";
  const scan = activity?.lastScan;
  if (!scan) return "Never scanned";
  const when = formatShortTime(scan.finishedAt ?? scan.startedAt);
  if (scan.patchesCreated === 0) return `${when} · Patch 0`;
  if (scan.patchesCreated != null) {
    return `${when} · ${scan.patchesCreated} patch${scan.patchesCreated === 1 ? "" : "es"}`;
  }
  return when;
}

export function TargetSidebar({
  targets,
  selectedId,
  loading,
  connected,
  activity,
  activityLoading,
  scanInProgress,
  onRefresh,
  onSelect,
  onAsk
}: {
  targets: SidebarTarget[];
  selectedId: string | null;
  loading: boolean;
  connected: boolean;
  activity: TargetActivitySummary | null;
  activityLoading: boolean;
  scanInProgress: boolean;
  onRefresh: () => void;
  onSelect: (target: SidebarTarget) => void;
  onAsk: (prompt: string) => void;
}) {
  const visible = targets.filter((target) => target.status !== "archived");
  const selected = visible.find((target) => target.id === selectedId) ?? null;

  return (
    <aside className="hidden sm:flex w-72 shrink-0 flex-col border-r border-kumo-line bg-kumo-base">
      <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-kumo-line">
        <div className="flex items-center gap-2 min-w-0">
          <CrosshairIcon size={14} className="text-kumo-inactive shrink-0" />
          <Text size="xs" bold>
            Targets
          </Text>
          <span className="text-[11px] text-kumo-subtle tabular-nums">
            {visible.length}
          </span>
        </div>
        <Button
          variant="ghost"
          shape="square"
          size="sm"
          aria-label="Refresh targets"
          disabled={!connected || loading}
          icon={
            <ArrowsClockwiseIcon
              size={14}
              className={loading || activityLoading ? "animate-spin" : undefined}
            />
          }
          onClick={onRefresh}
        />
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-2">
        {!connected ? (
          <p className="px-2 py-3 text-xs text-kumo-subtle">
            Connect to load targets.
          </p>
        ) : visible.length === 0 && !loading ? (
          <p className="px-2 py-3 text-xs text-kumo-subtle">
            No active targets yet.
          </p>
        ) : (
          <ul className="space-y-0.5">
            {visible.map((target) => {
              const isSelected = target.id === selectedId;
              return (
                <li key={target.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(target)}
                    aria-pressed={isSelected}
                    className={`w-full text-left rounded-lg px-2.5 py-2 transition-colors ${
                      isSelected
                        ? "bg-kumo-control ring-1 ring-kumo-brand/40"
                        : "hover:bg-kumo-control/60"
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      <span
                        className={`mt-1.5 size-1.5 rounded-full shrink-0 ${statusDotClass(target.status)}`}
                        aria-hidden
                      />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium text-kumo-default">
                          {target.name}
                        </div>
                        <div className="truncate text-[11px] text-kumo-subtle">
                          {target.status}
                          {target.category ? ` · ${target.category}` : ""}
                        </div>
                      </div>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {selected && (
          <div className="mt-3 border-t border-kumo-line pt-3 px-1 space-y-3">
            <div>
              <div className="text-[10px] uppercase tracking-wide text-kumo-subtle px-1.5 mb-1">
                Last scan
              </div>
              <p className="px-1.5 text-xs text-kumo-default">
                {activityLoading && !activity
                  ? "Loading…"
                  : lastScanLabel(activity, scanInProgress)}
              </p>
              {!scanInProgress &&
                activity?.lastScan?.proposalsCreated != null &&
                activity.lastScan.proposalsCreated > 0 && (
                  <p className="px-1.5 text-[11px] text-kumo-subtle">
                    +{activity.lastScan.proposalsCreated} proposal
                    {activity.lastScan.proposalsCreated === 1 ? "" : "s"} last
                    run
                  </p>
                )}
            </div>

            <div>
              <div className="flex items-center justify-between gap-2 px-1.5 mb-1">
                <div className="text-[10px] uppercase tracking-wide text-kumo-subtle">
                  Patches today
                </div>
                <span className="text-[11px] tabular-nums text-kumo-subtle">
                  {activity?.patchesToday ?? 0}
                </span>
              </div>
              {(activity?.recentPatches.length ?? 0) === 0 ? (
                <p className="px-1.5 text-[11px] text-kumo-subtle">No patches yet</p>
              ) : (
                <ul className="space-y-0.5">
                  {activity!.recentPatches.map((patch) => (
                    <li key={patch.id}>
                      <button
                        type="button"
                        className="w-full text-left rounded-md px-1.5 py-1 hover:bg-kumo-control/60 transition-colors"
                        onClick={() =>
                          onAsk(`Show patch ${patch.id} for this target`)
                        }
                      >
                        <div className="truncate text-xs text-kumo-default">
                          {patch.title}
                        </div>
                        <div className="truncate text-[10px] text-kumo-subtle">
                          {patch.type} · {patch.sectionKey}
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <button
                type="button"
                className="mt-1 px-1.5 text-[11px] text-kumo-brand hover:underline"
                onClick={() => onAsk("오늘 뭐 바뀐 거 있어?")}
              >
                Ask about today&apos;s patches
              </button>
            </div>

            <div>
              <div className="flex items-center justify-between gap-2 px-1.5 mb-1">
                <div className="text-[10px] uppercase tracking-wide text-kumo-subtle">
                  Pending proposals
                </div>
                <span className="text-[11px] tabular-nums text-kumo-subtle">
                  {activity?.pendingProposals.length ?? 0}
                </span>
              </div>
              {(activity?.pendingProposals.length ?? 0) === 0 ? (
                <p className="px-1.5 text-[11px] text-kumo-subtle">None pending</p>
              ) : (
                <ul className="space-y-0.5">
                  {activity!.pendingProposals.map((proposal) => (
                    <li key={proposal.id}>
                      <button
                        type="button"
                        className="w-full text-left rounded-md px-1.5 py-1 hover:bg-kumo-control/60 transition-colors"
                        onClick={() =>
                          onAsk(
                            `섹션 제안 ${proposal.id} 설명해줘. 필요하면 accept 할지 물어봐.`
                          )
                        }
                      >
                        <div className="truncate text-xs text-kumo-default">
                          {proposal.title}
                        </div>
                        <div className="truncate text-[10px] text-kumo-subtle">
                          {proposal.sectionKey}
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <button
                type="button"
                className="mt-1 px-1.5 text-[11px] text-kumo-brand hover:underline"
                onClick={() => onAsk("섹션 제안 목록 보여줘")}
              >
                List proposals
              </button>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
