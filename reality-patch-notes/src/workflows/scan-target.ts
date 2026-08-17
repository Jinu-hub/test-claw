/**
 * ScanTargetWorkflow — durable background scan with progress broadcast to UI.
 * Calls ChatAgent.runScanTarget → reality/scan.ts.
 */
import {
  AgentWorkflow,
  type AgentWorkflowEvent,
  type AgentWorkflowStep
} from "agents/workflows";
import type { ChatAgent } from "../server";

export type ScanTargetParams = {
  targetId: string;
};

type PrepareResult = {
  targetId: string;
  name: string;
};

type ScanResult = {
  targetId: string;
  name: string;
  scanRunId: string;
  fetched: number;
  stored: number;
  skipped: number;
  failed: number;
  pendingCompared: number;
  ignored: number;
  llmCalled: boolean;
  patchesCreated: number;
  patchedSectionKeys: string[];
  proposalsCreated: number;
  proposedSectionKeys: string[];
  message: string;
};

export class ScanTargetWorkflow extends AgentWorkflow<
  ChatAgent,
  ScanTargetParams
> {
  async run(
    event: AgentWorkflowEvent<ScanTargetParams>,
    step: AgentWorkflowStep
  ) {
    const { targetId } = event.payload;

    await this.reportProgress({
      step: "start",
      status: "running",
      percent: 0.05,
      targetId,
      message: "Starting scan…"
    });

    const prepared = await step.do(
      "prepare",
      async (): Promise<PrepareResult> => {
        const value = await this.agent.prepareScanTarget(targetId);
        return {
          targetId: String(value.targetId),
          name: String(value.name)
        };
      }
    );

    await this.reportProgress({
      step: "prepared",
      status: "running",
      percent: 0.2,
      targetId,
      name: prepared.name,
      message: `Fetching and comparing sources for ${prepared.name}…`
    });

    const result = await step.do(
      "scan-and-patch",
      async (): Promise<ScanResult> => {
        const value = await this.agent.runScanTarget(targetId);
        return {
          targetId: String(value.targetId),
          name: String(value.name),
          scanRunId: String(value.scanRunId),
          fetched: Number(value.fetched),
          stored: Number(value.stored),
          skipped: Number(value.skipped),
          failed: Number(value.failed),
          pendingCompared: Number(value.pendingCompared),
          ignored: Number(value.ignored),
          llmCalled: Boolean(value.llmCalled),
          patchesCreated: Number(value.patchesCreated),
          patchedSectionKeys: [...value.patchedSectionKeys].map(String),
          proposalsCreated: Number(value.proposalsCreated),
          proposedSectionKeys: [...value.proposedSectionKeys].map(String),
          message: String(value.message)
        };
      }
    );

    await this.reportProgress({
      step: "complete",
      status: "complete",
      percent: 1,
      targetId,
      name: result.name,
      patchesCreated: result.patchesCreated,
      proposalsCreated: result.proposalsCreated,
      message: "Scan finishing…"
    });

    await step.reportComplete(result);
    return result;
  }
}
