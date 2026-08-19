/**
 * Inline editor for pending Watch Intent proposals — delete items, manual add, apply/reject.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { PlusIcon, XIcon } from "@phosphor-icons/react";
import { Button } from "@cloudflare/kumo";
import type { ActivityIntentProposalItem } from "../reality";

type IntentDraft = {
  focus: string[];
  ignore: string[];
  priority: string[];
};

function normalizeTerm(raw: string): string {
  return raw.trim().replace(/\s+/g, " ");
}

function hasTerm(list: string[], term: string): boolean {
  const key = term.toLowerCase();
  return list.some((item) => item.toLowerCase() === key);
}

function IntentSection({
  title,
  items,
  inputValue,
  onInputChange,
  onRemove,
  onAdd,
  disabled
}: {
  title: string;
  items: string[];
  inputValue: string;
  onInputChange: (value: string) => void;
  onRemove: (index: number) => void;
  onAdd: () => void;
  disabled: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <p className="text-[11px] font-medium text-kumo-subtle">{title}</p>
      {items.length === 0 ? (
        <p className="text-[11px] text-kumo-subtle px-0.5">항목 없음</p>
      ) : (
        <ul className="space-y-0.5">
          {items.map((item, index) => (
            <li
              key={`${item}-${index}`}
              className="flex items-center gap-1 rounded-md bg-kumo-control/50 pl-2 pr-0.5 py-0.5"
            >
              <span className="min-w-0 flex-1 truncate text-[11px] text-kumo-default">
                {item}
              </span>
              <button
                type="button"
                disabled={disabled}
                aria-label={`${item} 삭제`}
                className="shrink-0 rounded p-1 text-kumo-subtle hover:bg-kumo-control hover:text-kumo-default disabled:opacity-40"
                onClick={() => onRemove(index)}
              >
                <XIcon size={12} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex gap-1">
        <input
          type="text"
          value={inputValue}
          disabled={disabled}
          placeholder="항목 추가"
          className="min-w-0 flex-1 rounded-md border border-kumo-line bg-kumo-base px-2 py-1 text-[11px] text-kumo-default placeholder:text-kumo-subtle focus:outline-none focus:ring-1 focus:ring-kumo-brand/50 disabled:opacity-40"
          onChange={(event) => onInputChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              onAdd();
            }
          }}
        />
        <Button
          variant="secondary"
          size="sm"
          disabled={disabled || !inputValue.trim()}
          aria-label={`${title} 항목 추가`}
          icon={<PlusIcon size={12} />}
          onClick={onAdd}
        />
      </div>
    </div>
  );
}

export function WatchIntentProposalEditor({
  proposal,
  disabled,
  busy,
  onApply,
  onReject
}: {
  proposal: ActivityIntentProposalItem;
  disabled: boolean;
  busy: boolean;
  onApply: (draft: IntentDraft) => void | Promise<void>;
  onReject: () => void | Promise<void>;
}) {
  const rootRef = useRef<HTMLElement>(null);
  const [draft, setDraft] = useState<IntentDraft>({
    focus: [...proposal.focus],
    ignore: [...proposal.ignore],
    priority: [...proposal.priority]
  });
  const [focusInput, setFocusInput] = useState("");
  const [ignoreInput, setIgnoreInput] = useState("");
  const [priorityInput, setPriorityInput] = useState("");

  useEffect(() => {
    setDraft({
      focus: [...proposal.focus],
      ignore: [...proposal.ignore],
      priority: [...proposal.priority]
    });
    setFocusInput("");
    setIgnoreInput("");
    setPriorityInput("");
    rootRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [proposal.id, proposal.createdAt]);

  const addToList = useCallback(
    (key: keyof IntentDraft, raw: string, clear: () => void) => {
      const term = normalizeTerm(raw);
      if (!term) return;
      setDraft((current) => {
        if (hasTerm(current[key], term)) return current;
        return { ...current, [key]: [...current[key], term] };
      });
      clear();
    },
    []
  );

  const removeFromList = useCallback((key: keyof IntentDraft, index: number) => {
    setDraft((current) => ({
      ...current,
      [key]: current[key].filter((_, i) => i !== index)
    }));
  }, []);

  const locked = disabled || busy;

  return (
    <section
      ref={rootRef}
      className="rounded-xl border border-kumo-brand/30 bg-kumo-control/25 px-2.5 py-2.5 space-y-3"
    >
      <div>
        <p className="text-[11px] font-semibold text-kumo-default">
          Watch Intent 제안
        </p>
        {proposal.rationale ? (
          <p className="mt-1 text-[10px] leading-relaxed text-kumo-subtle">
            {proposal.rationale}
          </p>
        ) : null}
      </div>

      <IntentSection
        title="Focus"
        items={draft.focus}
        inputValue={focusInput}
        onInputChange={setFocusInput}
        onRemove={(index) => removeFromList("focus", index)}
        onAdd={() => addToList("focus", focusInput, () => setFocusInput(""))}
        disabled={locked}
      />

      <IntentSection
        title="Ignore"
        items={draft.ignore}
        inputValue={ignoreInput}
        onInputChange={setIgnoreInput}
        onRemove={(index) => removeFromList("ignore", index)}
        onAdd={() => addToList("ignore", ignoreInput, () => setIgnoreInput(""))}
        disabled={locked}
      />

      <IntentSection
        title="Priority"
        items={draft.priority}
        inputValue={priorityInput}
        onInputChange={setPriorityInput}
        onRemove={(index) => removeFromList("priority", index)}
        onAdd={() =>
          addToList("priority", priorityInput, () => setPriorityInput(""))
        }
        disabled={locked}
      />

      <div className="flex gap-1.5 pt-0.5">
        <Button
          variant="ghost"
          size="sm"
          className="flex-1"
          disabled={locked}
          onClick={() => void onReject()}
        >
          전체 거절
        </Button>
        <Button
          variant="primary"
          size="sm"
          className="flex-1"
          disabled={locked}
          onClick={() => void onApply(draft)}
        >
          {busy ? "적용 중…" : "적용"}
        </Button>
      </div>
    </section>
  );
}
