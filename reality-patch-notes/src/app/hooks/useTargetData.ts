/**
 * Sidebar data via @callable RPC (listStoredTargets, getTargetActivity).
 * Also refreshes when chat tools complete or WebSocket events fire (via refs).
 */
import { useCallback, useEffect, useRef, useState, type MutableRefObject } from "react";
import { isToolUIPart, getToolName, type UIMessage } from "ai";
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
  refreshActivityRef
}: {
  agent: { stub: AgentStub };
  connected: boolean;
  messages: UIMessage[];
  backgroundJobs: BackgroundJob[];
  refreshTargetsRef: MutableRefObject<() => void>;
  refreshActivityRef: MutableRefObject<() => void>;
}) {
  const [targets, setTargets] = useState<SidebarTarget[]>([]);
  const [targetsLoading, setTargetsLoading] = useState(false);
  const [selectedTargetId, setSelectedTargetId] = useState<string | null>(null);
  const [activity, setActivity] = useState<TargetActivitySummary | null>(null);
  const [activityLoading, setActivityLoading] = useState(false);
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
          pendingProposals: result.pendingProposals
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
    toggleSelectedTarget
  };
}
