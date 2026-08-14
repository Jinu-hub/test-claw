import { Suspense, useCallback, useState, useEffect, useRef } from "react";
import { useAgent } from "agents/react";
import { useAgentChat } from "@cloudflare/ai-chat/react";
import { isToolUIPart, type UIMessage } from "ai";
import type { ChatAgent } from "./server";
import {
  Badge,
  Button,
  Empty,
  InputArea,
  PoweredByCloudflare,
  Switch,
  Text
} from "@cloudflare/kumo";
import { Toasty, useKumoToastManager } from "@cloudflare/kumo/components/toast";
import { Streamdown } from "streamdown";
import { code } from "@streamdown/code";
import {
  PaperPlaneRightIcon,
  StopIcon,
  TrashIcon,
  ChatCircleDotsIcon,
  CircleIcon,
  BrainIcon,
  CaretDownIcon,
  BugIcon,
  PaperclipIcon,
  ImageIcon,
  XIcon
} from "@phosphor-icons/react";
import { featureFlags, getExamplePrompts } from "./feature-flags";
import { handleClientToolCall } from "./tools/client";
import {
  parseRealityInitializedEvent,
  parseRealityScannedEvent,
  parseScheduledTaskEvent
} from "./tools/shared";
import { McpPanel, useMcpState } from "./components/McpPanel";
import { ThemeToggle } from "./components/ThemeToggle";
import { ToolPartView } from "./components/ToolPartView";
import { fileToDataUri, useAttachments } from "./hooks/useAttachments";

const examplePrompts = getExamplePrompts();

function Chat() {
  const [connected, setConnected] = useState(false);
  const [input, setInput] = useState("");
  const [showDebug, setShowDebug] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const toasts = useKumoToastManager();
  const { mcpState, onMcpUpdate } = useMcpState(featureFlags.mcp);
  const {
    attachments,
    isDragging,
    addFiles,
    removeAttachment,
    clearAttachments,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    handlePaste
  } = useAttachments();

  const agent = useAgent<ChatAgent>({
    agent: "ChatAgent",
    onOpen: useCallback(() => setConnected(true), []),
    onClose: useCallback(() => setConnected(false), []),
    onError: useCallback(
      (error: Event) => console.error("WebSocket error:", error),
      []
    ),
    onMcpUpdate: featureFlags.mcp ? onMcpUpdate : undefined,
    onMessage: useCallback(
      (message: MessageEvent) => {
        try {
          const data = JSON.parse(String(message.data));
          const scheduled = parseScheduledTaskEvent(data);
          if (featureFlags.schedule && scheduled) {
            toasts.add({
              title: "Scheduled task completed",
              description: scheduled.description,
              timeout: 0
            });
          }
          const initialized = parseRealityInitializedEvent(data);
          if (initialized) {
            toasts.add({
              title: "Reality initialized",
              description: `${initialized.name || initialized.targetId} · ${initialized.sectionKeys.length} sections`,
              timeout: 0
            });
          }
          const scanned = parseRealityScannedEvent(data);
          if (scanned) {
            const sectionNote =
              scanned.patchedSectionKeys.length > 0
                ? ` · ${scanned.patchedSectionKeys.join(", ")}`
                : "";
            toasts.add({
              title:
                scanned.patchesCreated === 0
                  ? "Scan complete · 0 patches"
                  : `Scan complete · ${scanned.patchesCreated} patch${scanned.patchesCreated === 1 ? "" : "es"}`,
              description: `${scanned.name || scanned.targetId}${sectionNote}`,
              timeout: 0
            });
          }
        } catch {
          // Not JSON or not our event
        }
      },
      [toasts]
    )
  });

  const {
    messages,
    sendMessage,
    clearHistory,
    addToolApprovalResponse,
    stop,
    status
  } = useAgentChat({
    agent,
    experimental_throttle: 100,
    onToolCall: async ({ toolCall, addToolOutput }) => {
      handleClientToolCall({ toolCall, addToolOutput });
    }
  });

  const isStreaming = status === "streaming" || status === "submitted";

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

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
    if (text) parts.push({ type: "text", text });

    if (featureFlags.images) {
      for (const att of attachments) {
        const dataUri = await fileToDataUri(att.file);
        parts.push({ type: "file", mediaType: att.mediaType, url: dataUri });
      }
      clearAttachments();
    }

    sendMessage({ role: "user", parts });
    if (textareaRef.current) textareaRef.current.style.height = "auto";
  }, [input, attachments, isStreaming, sendMessage, clearAttachments]);

  return (
    <div
      className="flex flex-col h-screen bg-kumo-elevated relative"
      onDragOver={featureFlags.images ? handleDragOver : undefined}
      onDragLeave={featureFlags.images ? handleDragLeave : undefined}
      onDrop={featureFlags.images ? handleDrop : undefined}
    >
      {featureFlags.images && isDragging && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-kumo-elevated/80 backdrop-blur-sm border-2 border-dashed border-kumo-brand rounded-xl m-2 pointer-events-none">
          <div className="flex flex-col items-center gap-2 text-kumo-brand">
            <ImageIcon size={40} />
            <Text variant="heading3" as="span">
              Drop images here
            </Text>
          </div>
        </div>
      )}

      <header className="px-5 py-4 bg-kumo-base border-b border-kumo-line">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-semibold text-kumo-default">
              <span className="mr-2">⛅</span>Reality Patch Notes
            </h1>
            <Badge variant="secondary">
              <ChatCircleDotsIcon size={12} weight="bold" className="mr-1" />
              Phase 6
            </Badge>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <CircleIcon
                size={8}
                weight="fill"
                className={connected ? "text-kumo-success" : "text-kumo-danger"}
              />
              <Text size="xs" variant="secondary">
                {connected ? "Connected" : "Disconnected"}
              </Text>
            </div>
            <div className="flex items-center gap-1.5">
              <BugIcon size={14} className="text-kumo-inactive" />
              <Switch
                checked={showDebug}
                onCheckedChange={setShowDebug}
                size="sm"
                aria-label="Toggle debug mode"
              />
            </div>
            <ThemeToggle />
            {featureFlags.mcp && (
              <McpPanel
                mcpState={mcpState}
                onAddServer={(name, url) => agent.stub.addServer(name, url)}
                onRemoveServer={(id) => agent.stub.removeServer(id)}
              />
            )}
            <Button
              variant="secondary"
              icon={<TrashIcon size={16} />}
              onClick={clearHistory}
            >
              Clear
            </Button>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-5 py-6 space-y-5">
          {messages.length === 0 && (
            <Empty
              icon={<ChatCircleDotsIcon size={32} />}
              title="What changed in the reality you already knew?"
              contents={
                <div className="flex flex-col items-center gap-4">
                  <div className="max-w-md text-center">
                    <Text variant="secondary">
                      Reality remembers current facts and reports only
                      meaningful changes. Re-scan the same docs for 0 patches,
                      or inject a test change to see a patch.
                    </Text>
                  </div>
                  {examplePrompts.length > 0 ? (
                    <div className="flex flex-wrap justify-center gap-2">
                      {examplePrompts.map((prompt) => (
                        <Button
                          key={prompt}
                          variant="outline"
                          size="sm"
                          disabled={isStreaming}
                          onClick={() => {
                            sendMessage({
                              role: "user",
                              parts: [{ type: "text", text: prompt }]
                            });
                          }}
                        >
                          {prompt}
                        </Button>
                      ))}
                    </div>
                  ) : null}
                </div>
              }
            />
          )}

          {messages.map((message: UIMessage, index: number) => {
            const isUser = message.role === "user";
            const isLastAssistant =
              message.role === "assistant" && index === messages.length - 1;

            return (
              <div key={message.id} className="space-y-2">
                {showDebug && (
                  <pre className="text-[11px] text-kumo-subtle bg-kumo-control rounded-lg p-3 overflow-auto max-h-64">
                    {JSON.stringify(message, null, 2)}
                  </pre>
                )}

                {message.parts.map((part, i) => {
                  const key = `${message.id}-${i}`;

                  if (isToolUIPart(part)) {
                    return (
                      <ToolPartView
                        key={key}
                        part={part}
                        addToolApprovalResponse={addToolApprovalResponse}
                      />
                    );
                  }

                  if (part.type === "reasoning") {
                    if (!part.text.trim()) return null;
                    const isDone = part.state === "done" || !isStreaming;
                    return (
                      <div key={key} className="flex justify-start">
                        <details className="max-w-[85%] w-full" open={!isDone}>
                          <summary className="flex items-center gap-2 cursor-pointer px-3 py-2 rounded-lg bg-purple-500/10 border border-purple-500/20 text-sm select-none">
                            <BrainIcon size={14} className="text-purple-400" />
                            <span className="font-medium text-kumo-default">
                              Reasoning
                            </span>
                            {isDone ? (
                              <span className="text-xs text-kumo-success">
                                Complete
                              </span>
                            ) : (
                              <span className="text-xs text-kumo-brand">
                                Thinking...
                              </span>
                            )}
                            <CaretDownIcon
                              size={14}
                              className="ml-auto text-kumo-inactive"
                            />
                          </summary>
                          <pre className="mt-2 px-3 py-2 rounded-lg bg-kumo-control text-xs text-kumo-default whitespace-pre-wrap overflow-auto max-h-64">
                            {part.text}
                          </pre>
                        </details>
                      </div>
                    );
                  }

                  if (
                    part.type === "file" &&
                    part.mediaType.startsWith("image/")
                  ) {
                    return (
                      <div
                        key={key}
                        className={`flex ${isUser ? "justify-end" : "justify-start"}`}
                      >
                        <img
                          src={part.url}
                          alt="Attachment"
                          className="max-h-64 rounded-xl border border-kumo-line object-contain"
                        />
                      </div>
                    );
                  }

                  if (part.type === "text") {
                    if (!part.text) return null;

                    if (isUser) {
                      return (
                        <div key={key} className="flex justify-end">
                          <div className="max-w-[85%] px-4 py-2.5 rounded-2xl rounded-br-md bg-kumo-contrast text-kumo-inverse leading-relaxed">
                            {part.text}
                          </div>
                        </div>
                      );
                    }

                    return (
                      <div key={key} className="flex justify-start">
                        <div className="max-w-[85%] rounded-2xl rounded-bl-md bg-kumo-base text-kumo-default leading-relaxed">
                          <Streamdown
                            className="sd-theme rounded-2xl rounded-bl-md p-3"
                            plugins={{ code }}
                            controls={false}
                            isAnimating={isLastAssistant && isStreaming}
                          >
                            {part.text}
                          </Streamdown>
                        </div>
                      </div>
                    );
                  }

                  return null;
                })}
              </div>
            );
          })}

          <div ref={messagesEndRef} />
        </div>
      </div>

      <div className="border-t border-kumo-line bg-kumo-base">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
          className="max-w-3xl mx-auto px-5 py-4"
        >
          {featureFlags.images && (
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*"
              aria-label="Upload image attachments"
              className="hidden"
              onChange={(e) => {
                if (e.target.files) addFiles(e.target.files);
                e.target.value = "";
              }}
            />
          )}

          {featureFlags.images && attachments.length > 0 && (
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
                    onClick={() => removeAttachment(att.id)}
                    className="absolute top-0.5 right-0.5 rounded-full bg-kumo-contrast/80 text-kumo-inverse p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                    aria-label={`Remove ${att.file.name}`}
                  >
                    <XIcon size={10} />
                  </button>
                </div>
              ))}
            </div>
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
                  send();
                }
              }}
              onInput={(e) => {
                const el = e.currentTarget;
                el.style.height = "auto";
                el.style.height = `${el.scrollHeight}px`;
              }}
              onPaste={featureFlags.images ? handlePaste : undefined}
              placeholder={
                featureFlags.images && attachments.length > 0
                  ? "Add a message or send images..."
                  : "Ask for evidence, re-collect sources, or read Reality..."
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
                onClick={stop}
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
    </div>
  );
}

export default function App() {
  return (
    <Toasty>
      <Suspense
        fallback={
          <div className="flex items-center justify-center h-screen text-kumo-inactive">
            Loading...
          </div>
        }
      >
        <Chat />
      </Suspense>
    </Toasty>
  );
}
