import { useEffect, useRef } from "react";
import { isToolUIPart, type UIMessage } from "ai";
import { Empty, Text } from "@cloudflare/kumo";
import { Streamdown } from "streamdown";
import { code } from "@streamdown/code";
import {
  ChatCircleDotsIcon,
  BrainIcon,
  CaretDownIcon
} from "@phosphor-icons/react";
import { stripTargetFocus } from "../../components/TargetSidebar";
import { ToolPartView } from "../../components/ToolPartView";

export function ChatTranscript({
  messages,
  showDebug,
  isStreaming,
  addToolApprovalResponse
}: {
  messages: UIMessage[];
  showDebug: boolean;
  isStreaming: boolean;
  addToolApprovalResponse: (args: {
    id: string;
    approved: boolean;
    reason?: string;
  }) => void;
}) {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  return (
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
                    Scans patch existing facts and propose new capability
                    sections for you to accept. Patch 0 means nothing changed.
                    Use Suggested on the right to ask about the selected target.
                  </Text>
                </div>
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
                    const displayText = stripTargetFocus(part.text);
                    if (!displayText.trim()) return null;
                    return (
                      <div key={key} className="flex justify-end">
                        <div className="max-w-[85%] px-4 py-2.5 rounded-2xl rounded-br-md bg-kumo-contrast text-kumo-inverse leading-relaxed">
                          {displayText}
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
  );
}
