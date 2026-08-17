/**
 * WebSocket agent + chat stream + broadcast handlers (workflow progress, scan done).
 * Sidebar RPC refresh is triggered via refs supplied by useTargetData.
 */
import { useCallback, useState, type MutableRefObject } from "react";
import { useAgent } from "agents/react";
import { useAgentChat } from "@cloudflare/ai-chat/react";
import { useKumoToastManager } from "@cloudflare/kumo/components/toast";
import type { MCPServersState } from "agents";
import { featureFlags } from "../../feature-flags";
import { handleClientToolCall } from "../../starter";
import type { ChatAgent } from "../../server";
import {
  parseRealityActivityChangedEvent,
  parseRealityInitializedEvent,
  parseRealityScannedEvent,
  parseScheduledTaskEvent,
  parseWorkflowProgressEvent,
  workflowKindLabel,
  workflowStepLabel
} from "../../tools/shared";
import type { BackgroundJob } from "../types";

export function useAgentSession({
  refreshTargetsRef,
  refreshActivityRef,
  onMcpUpdate
}: {
  refreshTargetsRef: MutableRefObject<() => void>;
  refreshActivityRef: MutableRefObject<() => void>;
  onMcpUpdate?: (state: MCPServersState) => void;
}) {
  const [connected, setConnected] = useState(false);
  const [backgroundJobs, setBackgroundJobs] = useState<BackgroundJob[]>([]);
  const toasts = useKumoToastManager();

  const clearJobsForWorkflow = useCallback((workflowName: string) => {
    setBackgroundJobs((jobs) =>
      jobs.filter((job) => job.workflowName !== workflowName)
    );
  }, []);

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
          const progress = parseWorkflowProgressEvent(data);
          if (progress) {
            const key =
              progress.instanceId ||
              `${progress.workflowName}:${progress.progress.targetId ?? "job"}`;
            const percent = Math.max(
              0,
              Math.min(1, progress.progress.percent ?? 0)
            );
            const kind = workflowKindLabel(progress.workflowName);
            const name =
              progress.progress.name || progress.progress.targetId || "target";
            const detail =
              progress.progress.message ||
              `${workflowStepLabel(progress.progress.step)} · ${name}`;

            if (
              progress.progress.status === "complete" ||
              progress.progress.step === "complete"
            ) {
              setBackgroundJobs((jobs) =>
                jobs.filter((job) => job.key !== key)
              );
            } else {
              setBackgroundJobs((jobs) => {
                const next: BackgroundJob = {
                  key,
                  workflowName: progress.workflowName,
                  instanceId: progress.instanceId,
                  label: kind,
                  stepLabel: workflowStepLabel(progress.progress.step),
                  detail,
                  percent
                };
                const index = jobs.findIndex((job) => job.key === key);
                if (index < 0) return [...jobs, next];
                const copy = [...jobs];
                copy[index] = next;
                return copy;
              });
            }
          }
          const initialized = parseRealityInitializedEvent(data);
          if (initialized) {
            clearJobsForWorkflow("INITIALIZE_REALITY_WORKFLOW");
            refreshTargetsRef.current();
            refreshActivityRef.current();
            toasts.add({
              title: "Reality initialized",
              description: `${initialized.name || initialized.targetId} · ${initialized.sectionKeys.length} sections`,
              timeout: 0
            });
          }
          const scanned = parseRealityScannedEvent(data);
          if (scanned) {
            clearJobsForWorkflow("SCAN_TARGET_WORKFLOW");
            refreshTargetsRef.current();
            refreshActivityRef.current();
            const sectionNote =
              scanned.patchedSectionKeys.length > 0
                ? ` · patched ${scanned.patchedSectionKeys.join(", ")}`
                : "";
            const proposalNote =
              scanned.proposalsCreated > 0
                ? ` · ${scanned.proposalsCreated} proposal${scanned.proposalsCreated === 1 ? "" : "s"}`
                : "";
            const titleParts: string[] = [];
            titleParts.push(
              scanned.patchesCreated === 0
                ? "0 patches"
                : `${scanned.patchesCreated} patch${scanned.patchesCreated === 1 ? "" : "es"}`
            );
            if (scanned.proposalsCreated > 0) {
              titleParts.push(
                `${scanned.proposalsCreated} proposal${scanned.proposalsCreated === 1 ? "" : "s"}`
              );
            }
            toasts.add({
              title: `Scan complete · ${titleParts.join(" · ")}`,
              description: `${scanned.name || scanned.targetId}${sectionNote}${proposalNote}`,
              timeout: 0
            });
          }
          const activityChanged = parseRealityActivityChangedEvent(data);
          if (activityChanged) {
            refreshActivityRef.current();
          }
        } catch {
          // Not JSON or not our event
        }
      },
      [toasts, clearJobsForWorkflow, refreshTargetsRef, refreshActivityRef]
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

  return {
    agent,
    connected,
    messages,
    sendMessage,
    clearHistory,
    addToolApprovalResponse,
    stop,
    status,
    isStreaming,
    backgroundJobs
  };
}
