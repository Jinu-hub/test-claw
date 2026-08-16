import { ArrowsClockwiseIcon, CrosshairIcon } from "@phosphor-icons/react";
import { Button, Text } from "@cloudflare/kumo";

export type SidebarTarget = {
  id: string;
  name: string;
  description: string;
  category: string;
  status: string;
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

export function TargetSidebar({
  targets,
  selectedId,
  loading,
  connected,
  onRefresh,
  onSelect
}: {
  targets: SidebarTarget[];
  selectedId: string | null;
  loading: boolean;
  connected: boolean;
  onRefresh: () => void;
  onSelect: (target: SidebarTarget) => void;
}) {
  const visible = targets.filter((target) => target.status !== "archived");

  return (
    <aside className="hidden sm:flex w-60 shrink-0 flex-col border-r border-kumo-line bg-kumo-base">
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
              className={loading ? "animate-spin" : undefined}
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
              const selected = target.id === selectedId;
              return (
                <li key={target.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(target)}
                    aria-pressed={selected}
                    className={`w-full text-left rounded-lg px-2.5 py-2 transition-colors ${
                      selected
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
      </div>
    </aside>
  );
}
