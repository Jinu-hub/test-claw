import { useCallback, useEffect, useRef, useState } from "react";
import { Button, InputArea, PoweredByCloudflare } from "@cloudflare/kumo";
import {
  PaperPlaneRightIcon,
  StopIcon,
  PaperclipIcon,
  XIcon
} from "@phosphor-icons/react";
import { featureFlags } from "../../feature-flags";
import { fileToDataUri, type Attachment } from "../../starter";
import {
  withTargetFocus,
  type SidebarTarget
} from "../../components/TargetSidebar";

export function ChatInput({
  connected,
  isStreaming,
  selectedTarget,
  attachments,
  onAddFiles,
  onRemoveAttachment,
  onClearAttachments,
  onPaste,
  onClearTargetFocus,
  onSendMessage,
  onStop
}: {
  connected: boolean;
  isStreaming: boolean;
  selectedTarget: SidebarTarget | null;
  attachments: Attachment[];
  onAddFiles: (files: FileList | File[]) => void;
  onRemoveAttachment: (id: string) => void;
  onClearAttachments: () => void;
  onPaste: (e: React.ClipboardEvent) => void;
  onClearTargetFocus: () => void;
  onSendMessage: (parts: Array<
    | { type: "text"; text: string }
    | { type: "file"; mediaType: string; url: string }
  >) => void;
  onStop: () => void;
}) {
  const [input, setInput] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isStreaming && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [isStreaming]);

  const send = useCallback(async () => {
    const text = input.trim();
    const canSendImages = featureFlags.images && attachments.length > 0;
    if ((!text && !canSendImages) || isStreaming) return;
    setInput("");

    const parts: Array<
      | { type: "text"; text: string }
      | { type: "file"; mediaType: string; url: string }
    > = [];
    const outbound =
      text || selectedTarget ? withTargetFocus(text, selectedTarget) : "";
    if (outbound) parts.push({ type: "text", text: outbound });

    if (featureFlags.images) {
      for (const att of attachments) {
        const dataUri = await fileToDataUri(att.file);
        parts.push({ type: "file", mediaType: att.mediaType, url: dataUri });
      }
      onClearAttachments();
    }

    onSendMessage(parts);
    if (textareaRef.current) textareaRef.current.style.height = "auto";
  }, [
    input,
    attachments,
    isStreaming,
    onSendMessage,
    onClearAttachments,
    selectedTarget
  ]);

  return (
    <div className="border-t border-kumo-line bg-kumo-base">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
        className="max-w-3xl mx-auto px-5 py-4"
      >
        {selectedTarget && (
          <div className="mb-2 flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-kumo-line bg-kumo-control/50 px-2.5 py-1 text-xs text-kumo-default">
              Focus: {selectedTarget.name}
              <button
                type="button"
                className="text-kumo-subtle hover:text-kumo-default"
                aria-label="Clear target focus"
                onClick={onClearTargetFocus}
              >
                <XIcon size={12} />
              </button>
            </span>
          </div>
        )}
        {featureFlags.images && (
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*"
            aria-label="Upload image attachments"
            className="hidden"
            onChange={(e) => {
              if (e.target.files) onAddFiles(e.target.files);
              e.target.value = "";
            }}
          />
        )}

        {featureFlags.images && attachments.length > 0 && (
          <AttachmentPreview
            attachments={attachments}
            onRemove={onRemoveAttachment}
          />
        )}

        <div className="flex items-end gap-3 rounded-xl border border-kumo-line bg-kumo-base p-3 shadow-sm focus-within:ring-2 focus-within:ring-kumo-ring focus-within:border-transparent transition-shadow">
          {featureFlags.images && (
            <Button
              type="button"
              variant="ghost"
              shape="square"
              aria-label="Attach images"
              icon={<PaperclipIcon size={18} />}
              onClick={() => fileInputRef.current?.click()}
              disabled={!connected || isStreaming}
              className="mb-0.5"
            />
          )}
          <InputArea
            ref={textareaRef}
            value={input}
            onValueChange={setInput}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
            onInput={(e) => {
              const el = e.currentTarget;
              el.style.height = "auto";
              el.style.height = `${el.scrollHeight}px`;
            }}
            onPaste={featureFlags.images ? onPaste : undefined}
            placeholder={
              featureFlags.images && attachments.length > 0
                ? "Add a message or send images..."
                : selectedTarget
                  ? `Ask about ${selectedTarget.name}...`
                  : "Select a target, then ask about Reality, patches, or evidence..."
            }
            disabled={!connected || isStreaming}
            rows={1}
            className="flex-1 ring-0! focus:ring-0! shadow-none! bg-transparent! outline-none! resize-none max-h-40"
          />
          {isStreaming ? (
            <Button
              type="button"
              variant="secondary"
              shape="square"
              aria-label="Stop generation"
              icon={<StopIcon size={18} />}
              onClick={onStop}
              className="mb-0.5"
            />
          ) : (
            <Button
              type="submit"
              variant="primary"
              shape="square"
              aria-label="Send message"
              disabled={
                (!input.trim() &&
                  !(featureFlags.images && attachments.length > 0)) ||
                !connected
              }
              icon={<PaperPlaneRightIcon size={18} />}
              className="mb-0.5"
            />
          )}
        </div>
      </form>
      <div className="flex justify-center pb-3">
        <PoweredByCloudflare href="https://developers.cloudflare.com/agents/" />
      </div>
    </div>
  );
}

function AttachmentPreview({
  attachments,
  onRemove
}: {
  attachments: Attachment[];
  onRemove: (id: string) => void;
}) {
  return (
    <div className="flex gap-2 mb-2 flex-wrap">
      {attachments.map((att) => (
        <div
          key={att.id}
          className="relative group rounded-lg border border-kumo-line bg-kumo-control overflow-hidden"
        >
          <img
            src={att.preview}
            alt={att.file.name}
            className="h-16 w-16 object-cover"
          />
          <button
            type="button"
            onClick={() => onRemove(att.id)}
            className="absolute top-0.5 right-0.5 rounded-full bg-kumo-contrast/80 text-kumo-inverse p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
            aria-label={`Remove ${att.file.name}`}
          >
            <XIcon size={10} />
          </button>
        </div>
      ))}
    </div>
  );
}
