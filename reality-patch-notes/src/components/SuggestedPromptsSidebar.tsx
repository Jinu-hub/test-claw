import { LightningIcon } from "@phosphor-icons/react";
import { Text } from "@cloudflare/kumo";
import type {
  SidebarTarget,
  TargetActivitySummary
} from "./TargetSidebar";

export type SuggestedPrompt = {
  id: string;
  label: string;
  prompt: string;
};

export function buildSuggestedPrompts(
  target: SidebarTarget | null,
  activity: TargetActivitySummary | null
): SuggestedPrompt[] {
  if (!target) {
    return [
      {
        id: "list-targets",
        label: "저장된 Target 보기",
        prompt: "지금 저장된 Target이 뭐야?"
      }
    ];
  }

  const name = target.name;
  const items: SuggestedPrompt[] = [];

  if ((activity?.pendingProposals.length ?? 0) > 0) {
    const first = activity!.pendingProposals[0];
    items.push({
      id: "list-proposals",
      label: "대기 중인 섹션 제안",
      prompt: "섹션 제안 목록 보여줘"
    });
    items.push({
      id: "accept-first-proposal",
      label: `${first.title} 수락할까?`,
      prompt: `${first.title} 제안(${first.id})을 acceptSectionProposal로 수락할지 물어보고, 내가 동의하면 수락해줘.`
    });
  }

  if ((activity?.patchesToday ?? 0) > 0) {
    items.push({
      id: "patches-today",
      label: "오늘 바뀐 점",
      prompt: "오늘 뭐 바뀐 거 있어?"
    });
  } else {
    items.push({
      id: "patches-recent",
      label: "최근 패치 보기",
      prompt: "최근 패치 목록 보여줘"
    });
  }

  items.push({
    id: "show-reality",
    label: "Reality Context",
    prompt: `${name} Reality Context 보여줘`
  });

  items.push({
    id: "scan",
    label: "다시 스캔",
    prompt: `${name} 다시 스캔해줘`
  });

  items.push({
    id: "evidence",
    label: "근거 / evidence",
    prompt: `${name} evidence 보여줘`
  });

  if (!activity?.lastScan) {
    items.unshift({
      id: "initialize",
      label: "초기 Reality 만들기",
      prompt: `${name} 초기 Reality 만들어줘`
    });
  }

  // Dedupe by prompt text, cap at 6
  const seen = new Set<string>();
  const unique: SuggestedPrompt[] = [];
  for (const item of items) {
    if (seen.has(item.prompt)) continue;
    seen.add(item.prompt);
    unique.push(item);
    if (unique.length >= 6) break;
  }
  return unique;
}

export function SuggestedPromptsSidebar({
  target,
  activity,
  disabled,
  onAsk
}: {
  target: SidebarTarget | null;
  activity: TargetActivitySummary | null;
  disabled: boolean;
  onAsk: (prompt: string) => void;
}) {
  const prompts = buildSuggestedPrompts(target, activity);

  return (
    <aside className="hidden lg:flex w-64 shrink-0 flex-col border-l border-kumo-line bg-kumo-base">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-kumo-line">
        <LightningIcon size={14} className="text-kumo-inactive shrink-0" />
        <Text size="xs" bold>
          Suggested
        </Text>
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-2">
        {!target ? (
          <p className="px-2 py-2 text-[11px] text-kumo-subtle">
            Select a target on the left to get tailored questions.
          </p>
        ) : (
          <p className="px-2 pb-2 text-[11px] text-kumo-subtle truncate">
            For {target.name}
          </p>
        )}

        <ul className="space-y-1">
          {prompts.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                disabled={disabled}
                onClick={() => onAsk(item.prompt)}
                className="w-full text-left rounded-lg px-2.5 py-2 text-xs text-kumo-default border border-transparent hover:border-kumo-line hover:bg-kumo-control/60 transition-colors disabled:opacity-40 disabled:pointer-events-none"
              >
                <span className="block font-medium leading-snug">
                  {item.label}
                </span>
                <span className="mt-0.5 block text-[10px] text-kumo-subtle line-clamp-2">
                  {item.prompt}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );
}
