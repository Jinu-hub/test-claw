/**
 * Main chat layout: 3-column shell wiring WebSocket, RPC sidebar, and transcript.
 */
import { useCallback, useRef, useState } from "react";
import { Text } from "@cloudflare/kumo";
import { ImageIcon } from "@phosphor-icons/react";
import { featureFlags } from "../feature-flags";
import { useAttachments, useMcpState } from "../starter";
import {
  TargetSidebar,
  withTargetFocus
} from "../components/TargetSidebar";
import { SuggestedPromptsSidebar } from "../components/SuggestedPromptsSidebar";
import { useAgentSession } from "./hooks/useAgentSession";
import { useTargetData } from "./hooks/useTargetData";
import { BackgroundJobsBar } from "./components/BackgroundJobsBar";
import { ChatHeader } from "./components/ChatHeader";
import { ChatInput } from "./components/ChatInput";
import { ChatTranscript } from "./components/ChatTranscript";

export function Chat() {
  const [showDebug, setShowDebug] = useState(false);
  const refreshTargetsRef = useRef<() => void>(() => {});
  const refreshActivityRef = useRef<() => void>(() => {});
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

  const session = useAgentSession({
    refreshTargetsRef,
    refreshActivityRef,
    onMcpUpdate
  });

  const targetData = useTargetData({
    agent: session.agent,
    connected: session.connected,
    messages: session.messages,
    backgroundJobs: session.backgroundJobs,
    refreshTargetsRef,
    refreshActivityRef
  });

  const sendPrompt = useCallback(
    (prompt: string) => {
      if (session.isStreaming) return;
      session.sendMessage({
        role: "user",
        parts: [
          {
            type: "text",
            text: withTargetFocus(prompt, targetData.selectedTarget)
          }
        ]
      });
    },
    [session.isStreaming, session.sendMessage, targetData.selectedTarget]
  );

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

      <ChatHeader
        connected={session.connected}
        showDebug={showDebug}
        onShowDebugChange={setShowDebug}
        onClearHistory={session.clearHistory}
        mcpState={mcpState}
        agentStub={session.agent.stub}
      />

      <div className="flex flex-1 min-h-0">
        <TargetSidebar
          targets={targetData.targets}
          selectedId={targetData.selectedTargetId}
          loading={targetData.targetsLoading}
          connected={session.connected}
          activity={targetData.activity}
          activityLoading={targetData.activityLoading}
          scanInProgress={targetData.scanInProgress}
          onRefresh={targetData.refreshSidebar}
          onSelect={targetData.toggleSelectedTarget}
          onAsk={sendPrompt}
        />

        <div className="flex flex-col flex-1 min-w-0">
          <BackgroundJobsBar jobs={session.backgroundJobs} />

          <ChatTranscript
            messages={session.messages}
            showDebug={showDebug}
            isStreaming={session.isStreaming}
            addToolApprovalResponse={session.addToolApprovalResponse}
          />

          <ChatInput
            connected={session.connected}
            isStreaming={session.isStreaming}
            selectedTarget={targetData.selectedTarget}
            attachments={attachments}
            onAddFiles={addFiles}
            onRemoveAttachment={removeAttachment}
            onClearAttachments={clearAttachments}
            onPaste={handlePaste}
            onClearTargetFocus={() => targetData.setSelectedTargetId(null)}
            onSendMessage={(parts) =>
              session.sendMessage({ role: "user", parts })
            }
            onStop={session.stop}
          />
        </div>

        <SuggestedPromptsSidebar
          target={targetData.selectedTarget}
          activity={targetData.activity}
          disabled={!session.connected || session.isStreaming}
          onAsk={sendPrompt}
        />
      </div>
    </div>
  );
}
