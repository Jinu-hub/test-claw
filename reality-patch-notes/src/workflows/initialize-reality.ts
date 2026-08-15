import {
  AgentWorkflow,
  type AgentWorkflowEvent,
  type AgentWorkflowStep
} from "agents/workflows";
import type { ChatAgent } from "../server";

export type InitializeRealityParams = {
  targetId: string;
  force?: boolean;
};

type PrepareResult = {
  targetId: string;
  name: string;
  packId: string;
  sourceCount: number;
};

type BuildResult = {
  targetId: string;
  name: string;
  objectKey: string;
  sectionKeys: string[];
  sourcesFetched: number;
  sourcesFailed: number;
  sourceUrls: string[];
  evidenceStored: number;
  evidenceSkipped: number;
};

export class InitializeRealityWorkflow extends AgentWorkflow<
  ChatAgent,
  InitializeRealityParams
> {
  async run(
    event: AgentWorkflowEvent<InitializeRealityParams>,
    step: AgentWorkflowStep
  ) {
    const { targetId, force = false } = event.payload;

    await this.reportProgress({
      step: "start",
      status: "running",
      percent: 0.05,
      targetId,
      message: "Starting initialize…"
    });

    const prepared = await step.do(
      "prepare",
      async (): Promise<PrepareResult> => {
        const value = await this.agent.prepareInitializeReality(
          targetId,
          force
        );
        return {
          targetId: String(value.targetId),
          name: String(value.name),
          packId: String(value.packId),
          sourceCount: Number(value.sourceCount)
        };
      }
    );

    await this.reportProgress({
      step: "prepared",
      status: "running",
      percent: 0.2,
      targetId,
      name: prepared.name,
      packId: prepared.packId,
      message: `Building Reality from ${prepared.sourceCount} sources…`
    });

    const result = await step.do(
      "build-and-save",
      async (): Promise<BuildResult> => {
        const value = await this.agent.runInitializeReality(targetId);
        return {
          targetId: String(value.targetId),
          name: String(value.name),
          objectKey: String(value.objectKey),
          sectionKeys: [...value.sectionKeys].map(String),
          sourcesFetched: Number(value.sourcesFetched),
          sourcesFailed: Number(value.sourcesFailed),
          sourceUrls: [...value.sourceUrls].map(String),
          evidenceStored: Number(value.evidenceStored),
          evidenceSkipped: Number(value.evidenceSkipped)
        };
      }
    );

    await this.reportProgress({
      step: "complete",
      status: "complete",
      percent: 1,
      targetId,
      name: result.name,
      sectionKeys: result.sectionKeys,
      message: "Initialize finishing…"
    });

    await step.reportComplete(result);
    return result;
  }
}
