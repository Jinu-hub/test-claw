/**
 * SuggestWatchIntentWorkflow — AI proposes Focus/Ignore/Priority; user must accept.
 */
import {
  AgentWorkflow,
  type AgentWorkflowEvent,
  type AgentWorkflowStep
} from "agents/workflows";
import type { ChatAgent } from "../server";

export type SuggestWatchIntentParams = {
  targetId: string;
};

type PrepareResult = {
  targetId: string;
  name: string;
};

type SuggestResult = {
  targetId: string;
  name: string;
  proposalId: string;
  focus: string[];
  ignore: string[];
  priority: string[];
  rationale: string;
};

export class SuggestWatchIntentWorkflow extends AgentWorkflow<
  ChatAgent,
  SuggestWatchIntentParams
> {
  async run(
    event: AgentWorkflowEvent<SuggestWatchIntentParams>,
    step: AgentWorkflowStep
  ) {
    const { targetId } = event.payload;

    await this.reportProgress({
      step: "start",
      status: "running",
      percent: 0.05,
      targetId,
      message: "Starting watch intent suggestion…"
    });

    const prepared = await step.do(
      "prepare",
      async (): Promise<PrepareResult> => {
        const value = await this.agent.prepareSuggestWatchIntent(targetId);
        return {
          targetId: String(value.targetId),
          name: String(value.name)
        };
      }
    );

    await this.reportProgress({
      step: "prepared",
      status: "running",
      percent: 0.3,
      targetId,
      name: prepared.name,
      message: `Suggesting Watch Intent for ${prepared.name}…`
    });

    const result = await step.do(
      "suggest-intent",
      async (): Promise<SuggestResult> => {
        const value = await this.agent.runSuggestWatchIntent(targetId);
        return {
          targetId: String(value.targetId),
          name: String(value.name),
          proposalId: String(value.proposalId),
          focus: [...value.focus],
          ignore: [...value.ignore],
          priority: [...value.priority],
          rationale: String(value.rationale)
        };
      }
    );

    await this.reportProgress({
      step: "complete",
      status: "complete",
      percent: 1,
      targetId,
      name: result.name,
      message: "Intent suggestion ready for review…"
    });

    await step.reportComplete(result);
    return result;
  }
}
