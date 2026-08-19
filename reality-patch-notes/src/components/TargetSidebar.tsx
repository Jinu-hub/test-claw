/**
 * Left sidebar — target list + activity summary.
 * Data via RPC (listStoredTargets, getTargetActivity), not chat tools.
 */
import { useState, type ReactNode } from "react";
import {
  ArrowsClockwiseIcon,
  CaretDownIcon,
  CrosshairIcon
} from "@phosphor-icons/react";
import { Button, Text } from "@cloudflare/kumo";
import type { SidebarTarget, TargetActivitySummary } from "../reality";
import { WatchIntentProposalEditor } from "./WatchIntentProposalEditor";

export type { SidebarTarget, TargetActivitySummary };

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
  return date.toLocaleString("ko-KR", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function lastScanSummary(
  activity: TargetActivitySummary | null,
  scanInProgress: boolean
): { when: string; result: string } {
  if (scanInProgress) {
    return { when: "진행 중", result: "스캔하고 있어요" };
  }
  const scan = activity?.lastScan;
  if (!scan) {
    return { when: "아직 없음", result: "한 번도 확인하지 않음" };
  }
  const when = formatShortTime(scan.finishedAt ?? scan.startedAt);
  if (scan.patchesCreated === 0) {
    return { when, result: "변화 없음" };
  }
  if (scan.patchesCreated != null) {
    return {
      when,
      result: `변화 ${scan.patchesCreated}건`
    };
  }
  return { when, result: "완료" };
}

function patchTypeLabel(type: string): string {
  switch (type) {
    case "ADDED":
      return "추가";
    case "CHANGED":
      return "변경";
    case "REMOVED":
      return "삭제";
    case "DEPRECATED":
      return "중단";
    default:
      return type;
  }
}

function SidebarSection({
  title,
  count,
  empty,
  emptyText,
  defaultOpen = false,
  children
}: {
  title: string;
  count?: number;
  empty: boolean;
  emptyText: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section>
      {empty ? (
        <>
          <div className="flex items-center justify-between gap-2 px-1 pb-1.5 mb-2 border-b border-kumo-line">
            <h3 className="text-[11px] font-semibold tracking-wide text-kumo-default">
              {title}
            </h3>
            {count != null ? (
              <span className="rounded-full bg-kumo-control px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-kumo-subtle">
                {count}
              </span>
            ) : null}
          </div>
          <p className="px-1 text-[12px] leading-relaxed text-kumo-subtle">
            {emptyText}
          </p>
        </>
      ) : (
        <>
          <button
            type="button"
            aria-expanded={open}
            onClick={() => setOpen((current) => !current)}
            className="flex w-full items-center justify-between gap-2 px-1 pb-1.5 mb-2 border-b border-kumo-line text-left"
          >
            <h3 className="text-[11px] font-semibold tracking-wide text-kumo-default">
              {title}
            </h3>
            <span className="flex items-center gap-1 shrink-0">
              {count != null ? (
                <span className="rounded-full bg-kumo-control px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-kumo-subtle">
                  {count}
                </span>
              ) : null}
              <CaretDownIcon
                size={12}
                className={`text-kumo-subtle transition-transform ${open ? "" : "-rotate-90"}`}
              />
            </span>
          </button>
          {open ? children : null}
        </>
      )}
    </section>
  );
}

function patchTypeClass(type: string): string {
  switch (type) {
    case "ADDED":
      return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300";
    case "CHANGED":
      return "bg-sky-500/15 text-sky-700 dark:text-sky-300";
    case "REMOVED":
      return "bg-rose-500/15 text-rose-700 dark:text-rose-300";
    case "DEPRECATED":
      return "bg-amber-500/15 text-amber-700 dark:text-amber-300";
    default:
      return "bg-kumo-control text-kumo-subtle";
  }
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
  onAsk,
  intentBusy,
  onApplyIntentDraft,
  onRejectIntentProposal
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
  intentBusy: boolean;
  onApplyIntentDraft: (input: {
    proposalId: string;
    focus: string[];
    ignore: string[];
    priority: string[];
  }) => void | Promise<void>;
  onRejectIntentProposal: (proposalId: string) => void | Promise<void>;
}) {
  const visible = targets.filter((target) => target.status !== "archived");
  const selected = visible.find((target) => target.id === selectedId) ?? null;
  const scanSummary = lastScanSummary(activity, scanInProgress);
  const recentPatches = [...(activity?.recentPatches ?? [])]
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, 4);
  const pendingProposals = activity?.pendingProposals ?? [];
  const pendingIntent = activity?.pendingIntentProposal ?? null;

  return (
    <aside className="hidden sm:flex w-72 shrink-0 flex-col border-r border-kumo-line bg-kumo-base">
      <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-kumo-line">
        <div className="flex items-center gap-2 min-w-0">
          <CrosshairIcon size={14} className="text-kumo-inactive shrink-0" />
          <Text size="xs" bold>
            주제
          </Text>
          <span className="text-[11px] text-kumo-subtle tabular-nums">
            {visible.length}
          </span>
        </div>
        <Button
          variant="ghost"
          shape="square"
          size="sm"
          aria-label="목록 새로고침"
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
            연결되면 주제가 나타납니다.
          </p>
        ) : visible.length === 0 && !loading ? (
          <p className="px-2 py-3 text-xs text-kumo-subtle">
            아직 지켜보는 주제가 없습니다.
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
                          {target.status === "active"
                            ? "지켜보는 중"
                            : target.status === "paused"
                              ? "일시 중지"
                              : target.status}
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
          <div className="mt-3 border-t border-kumo-line pt-3 px-1 space-y-4">
            <section className="rounded-xl bg-kumo-control/35 px-3 py-2.5">
              <p className="text-[11px] font-medium text-kumo-subtle">
                마지막 확인
              </p>
              {activityLoading && !activity ? (
                <p className="mt-1 text-sm text-kumo-subtle">불러오는 중…</p>
              ) : (
                <>
                  <p className="mt-1 text-sm font-medium text-kumo-default">
                    {scanSummary.result}
                  </p>
                  <p className="mt-0.5 text-[11px] text-kumo-subtle">
                    {scanSummary.when}
                    {!scanInProgress &&
                    activity?.lastScan?.proposalsCreated != null &&
                    activity.lastScan.proposalsCreated > 0
                      ? ` · 새 제안 ${activity.lastScan.proposalsCreated}건`
                      : ""}
                  </p>
                </>
              )}
            </section>

            <SidebarSection
              title="오늘 바뀐 점"
              count={activity?.patchesToday ?? 0}
              empty={(activity?.patchesToday ?? 0) === 0}
              emptyText="오늘 기록된 변화는 없습니다."
            >
              <p className="px-1 text-[12px] leading-relaxed text-kumo-default">
                오늘 {activity?.patchesToday}건이 기록됐습니다.
              </p>
              <button
                type="button"
                className="mt-1.5 px-1 text-[11px] font-medium text-kumo-brand hover:underline"
                onClick={() => onAsk("오늘 뭐 바뀐 거 있어?")}
              >
                오늘 변화 물어보기
              </button>
            </SidebarSection>

            <SidebarSection
              title="최근 바뀐 점"
              count={recentPatches.length}
              empty={recentPatches.length === 0}
              emptyText="아직 기록된 변화가 없습니다."
            >
              <ul className="space-y-1">
                {recentPatches.map((patch) => (
                  <li key={patch.id}>
                    <button
                      type="button"
                      className="w-full rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-kumo-control/70"
                      onClick={() =>
                        onAsk(`${patch.title} 패치 자세히 설명해줘`)
                      }
                    >
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span
                          className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${patchTypeClass(patch.type)}`}
                        >
                          {patchTypeLabel(patch.type)}
                        </span>
                        <span className="min-w-0 truncate text-[12px] font-medium text-kumo-default">
                          {patch.title}
                        </span>
                      </div>
                      <div className="mt-0.5 text-[10px] text-kumo-subtle">
                        {formatShortTime(patch.createdAt)}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
              <button
                type="button"
                className="mt-1.5 px-1 text-[11px] font-medium text-kumo-brand hover:underline"
                onClick={() => onAsk("최근 바뀐 점 목록 보여줘")}
              >
                최근 변화 물어보기
              </button>
            </SidebarSection>

            <SidebarSection
              title="관심 설정 제안"
              count={pendingIntent ? 1 : 0}
              empty={!pendingIntent}
              emptyText="대기 중인 Watch Intent 제안이 없습니다."
              defaultOpen
            >
              {pendingIntent ? (
                <WatchIntentProposalEditor
                  proposal={pendingIntent}
                  disabled={!connected}
                  busy={intentBusy}
                  onApply={(draft) =>
                    onApplyIntentDraft({
                      proposalId: pendingIntent.id,
                      focus: draft.focus,
                      ignore: draft.ignore,
                      priority: draft.priority
                    })
                  }
                  onReject={() => onRejectIntentProposal(pendingIntent.id)}
                />
              ) : null}
            </SidebarSection>

            <SidebarSection
              title="대기 중인 제안"
              count={pendingProposals.length}
              empty={pendingProposals.length === 0}
              emptyText="새 영역 제안이 없습니다."
            >
              <ul className="space-y-1">
                {pendingProposals.map((proposal) => (
                  <li key={proposal.id}>
                    <button
                      type="button"
                      className="w-full rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-kumo-control/70"
                      onClick={() =>
                        onAsk(
                          `${proposal.title} 제안을 설명해줘. 필요하면 반영할지 물어봐.`
                        )
                      }
                    >
                      <div className="truncate text-[12px] font-medium text-kumo-default">
                        {proposal.title}
                      </div>
                      <div className="mt-0.5 text-[10px] text-kumo-subtle">
                        반영 대기
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
              <button
                type="button"
                className="mt-1.5 px-1 text-[11px] font-medium text-kumo-brand hover:underline"
                onClick={() => onAsk("아직 반영 안 한 새 영역 제안 목록 보여줘")}
              >
                제안 목록 보기
              </button>
            </SidebarSection>
          </div>
        )}
      </div>
    </aside>
  );
}
