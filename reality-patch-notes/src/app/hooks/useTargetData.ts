/**
 * Sidebar data via @callable RPC (listStoredTargets, getTargetActivity).
 * Also refreshes when chat tools complete or WebSocket events fire (via refs).
 */
import { useCallback, useEffect, useRef, useState, type MutableRefObject } from "react";
import { isToolUIPart, getToolName, type UIMessage } from "ai";
import { useKumoToastManager } from "@cloudflare/kumo/components/toast";
import type { useAgent } from "agents/react";
import type { ChatAgent } from "../../server";
import type { SidebarTarget, TargetActivitySummary } from "../../reality";
import {
  ACTIVITY_REFRESH_TOOLS,
  TARGET_MUTATING_TOOLS
} from "../constants";
import type { BackgroundJob } from "../types";

type AgentStub = ReturnType<
  typeof useAgent<ChatAgent>
>["stub"];

export function useTargetData({
  agent,
  connected,
  messages,
  backgroundJobs,
  refreshTargetsRef,
  refreshActivityRef,
  onWatchIntentSuggestedRef
}: {
  agent: { stub: AgentStub };
  connected: boolean;
  messages: UIMessage[];
  backgroundJobs: BackgroundJob[];
  refreshTargetsRef: MutableRefObject<() => void>;
  refreshActivityRef: MutableRefObject<() => void>;
  onWatchIntentSuggestedRef?: MutableRefObject<(targetId: string) => void>;
}) {
  const toasts = useKumoToastManager();
  const [targets, setTargets] = useState<SidebarTarget[]>([]);
  const [targetsLoading, setTargetsLoading] = useState(false);
  const [selectedTargetId, setSelectedTargetId] = useState<string | null>(null);
  const [activity, setActivity] = useState<TargetActivitySummary | null>(null);
  const [activityLoading, setActivityLoading] = useState(false);
  const [intentBusy, setIntentBusy] = useState(false);
  const selectedTargetIdRef = useRef<string | null>(null);

  const refreshTargets = useCallback(async () => {
    if (!connected) return;
    setTargetsLoading(true);
    try {
      const rows = (await agent.stub.listStoredTargets()) as SidebarTarget[];
      const next = Array.isArray(rows) ? rows : [];
      setTargets(next);
      setSelectedTargetId((current) => {
        if (current && next.some((row) => row.id === current)) return current;
        const firstActive = next.find((row) => row.status === "active");
        return firstActive?.id ?? next[0]?.id ?? null;
      });
    } catch (error) {
      console.error("Failed to load targets:", error);
    } finally {
      setTargetsLoading(false);
    }
  }, [agent, connected]);

  const refreshActivity = useCallback(async () => {
    const targetId = selectedTargetIdRef.current;
    if (!connected || !targetId) {
      setActivity(null);
      return;
    }
    setActivityLoading(true);
    try {
      const result = (await agent.stub.getTargetActivity(targetId)) as
        | ({ found: true } & TargetActivitySummary)
        | { found: false; targetId: string };
      if (result.found && result.targetId === selectedTargetIdRef.current) {
        setActivity({
          targetId: result.targetId,
          lastScan: result.lastScan,
          patchesToday: result.patchesToday,
          recentPatches: result.recentPatches,
          pendingProposals: result.pendingProposals,
          pendingIntentProposal: result.pendingIntentProposal
        });
      } else if (!result.found) {
        setActivity(null);
      }
    } catch (error) {
      console.error("Failed to load target activity:", error);
    } finally {
      setActivityLoading(false);
    }
  }, [agent, connected]);

  refreshTargetsRef.current = () => {
    void refreshTargets();
  };
  refreshActivityRef.current = () => {
    void refreshActivity();
  };
  selectedTargetIdRef.current = selectedTargetId;

  useEffect(() => {
    if (!connected) {
      setTargets([]);
      setSelectedTargetId(null);
      setActivity(null);
      return;
    }
    void refreshTargets();
  }, [connected, refreshTargets]);

  useEffect(() => {
    void refreshActivity();
  }, [selectedTargetId, refreshActivity]);

  useEffect(() => {
    if (!connected || messages.length === 0) return;
    const recent = messages.slice(-4);
    let refreshList = false;
    let refreshAct = false;
    for (const message of recent) {
      for (const part of message.parts) {
        if (!isToolUIPart(part) || part.state !== "output-available") continue;
        const name = getToolName(part);
        if (TARGET_MUTATING_TOOLS.has(name)) refreshList = true;
        if (ACTIVITY_REFRESH_TOOLS.has(name)) refreshAct = true;
      }
    }
    if (refreshList) void refreshTargets();
    if (refreshAct) void refreshActivity();
  }, [messages, connected, refreshTargets, refreshActivity]);

  const selectedTarget =
    targets.find((target) => target.id === selectedTargetId) ?? null;

  const scanInProgress = backgroundJobs.some(
    (job) =>
      job.workflowName === "SCAN_TARGET_WORKFLOW" &&
      (job.detail.includes(selectedTarget?.name ?? "\0") ||
        job.key.includes(selectedTargetId ?? "\0"))
  );

  const toggleSelectedTarget = useCallback((target: SidebarTarget) => {
    setSelectedTargetId((current) =>
      current === target.id ? null : target.id
    );
  }, []);

  const refreshSidebar = useCallback(() => {
    void refreshTargets();
    void refreshActivity();
  }, [refreshTargets, refreshActivity]);

  const applyIntentDraft = useCallback(
    async (input: {
      proposalId: string;
      focus: string[];
      ignore: string[];
      priority: string[];
    }) => {
      const targetId = selectedTargetIdRef.current;
      if (!connected || !targetId || intentBusy) return;

      setIntentBusy(true);
      try {
        const result = (await agent.stub.applyWatchIntentDraft({
          targetId,
          ...input
        })) as
          | {
              applied: true;
              canInitialize: boolean;
              alreadyInitialized: boolean;
              targetName: string;
            }
          | { applied: false; message: string };

        if (!result.applied) {
          toasts.add({
            title: "Watch Intent 적용 실패",
            description: result.message,
            timeout: 5000
          });
          return;
        }

        await refreshTargets();
        await refreshActivity();
        const initHint = result.canInitialize
          ? result.alreadyInitialized
            ? "Reality는 이미 초기화되어 있습니다."
            : "채팅에서 초기 Reality 생성을 요청할 수 있습니다."
          : "이 주제는 source pack이 없어 initialize를 건너뛰면 됩니다.";
        toasts.add({
          title: "Watch Intent 적용됨",
          description: `${result.targetName} · ${initHint}`,
          timeout: 0
        });
      } catch (error) {
        console.error("Failed to apply watch intent draft:", error);
        toasts.add({
          title: "Watch Intent 적용 실패",
          description: error instanceof Error ? error.message : String(error),
          timeout: 5000
        });
      } finally {
        setIntentBusy(false);
      }
    },
    [agent, connected, intentBusy, refreshActivity, refreshTargets, toasts]
  );

  const rejectIntentProposal = useCallback(
    async (proposalId: string) => {
      const targetId = selectedTargetIdRef.current;
      if (!connected || !targetId || intentBusy) return;

      setIntentBusy(true);
      try {
        const result = (await agent.stub.rejectWatchIntentProposal({
          targetId,
          proposalId
        })) as { rejected: true } | { rejected: false; message: string };

        if (!result.rejected) {
          toasts.add({
            title: "제안 거절 실패",
            description: result.message,
            timeout: 5000
          });
          return;
        }

        await refreshActivity();
        toasts.add({
          title: "Watch Intent 제안 거절됨",
          description: "직접 관심 설정을 입력할 수 있습니다.",
          timeout: 5000
        });
      } catch (error) {
        console.error("Failed to reject watch intent proposal:", error);
        toasts.add({
          title: "제안 거절 실패",
          description: error instanceof Error ? error.message : String(error),
          timeout: 5000
        });
      } finally {
        setIntentBusy(false);
      }
    },
    [agent, connected, intentBusy, refreshActivity, toasts]
  );

  if (onWatchIntentSuggestedRef) {
    onWatchIntentSuggestedRef.current = (targetId: string) => {
      selectedTargetIdRef.current = targetId;
      setSelectedTargetId(targetId);
    };
  }

  return {
    targets,
    targetsLoading,
    selectedTargetId,
    setSelectedTargetId,
    selectedTarget,
    activity,
    activityLoading,
    scanInProgress,
    refreshTargets,
    refreshActivity,
    refreshSidebar,
    toggleSelectedTarget,
    intentBusy,
    applyIntentDraft,
    rejectIntentProposal
  };
}
