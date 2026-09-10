import { Agent, callable, routeAgentRequest } from "agents";
import {
  AgentWorkflow,
  type AgentWorkflowEvent,
  type AgentWorkflowStep,
} from "agents/workflows";
import {
  initialQuizState,
  type QuizState,
  TOTAL_ROUNDS,
} from "./types";

type Params = {
  topic: string;
};

/**
 * Phase 1 scaffold — full 5-round loop lands in Phase 3–5.
 * Keep step names fixed (question-N / grade-N) when implementing.
 */
export class QuizWorkflow extends AgentWorkflow<QuizAgent, Params> {
  async run(event: AgentWorkflowEvent<Params>, step: AgentWorkflowStep) {
    const topic = event.payload.topic;

    await step.mergeAgentState({
      status: "generating",
      topic,
      totalRounds: TOTAL_ROUNDS,
      round: 0,
      answers: [],
      roundHistory: [],
      finaleText: null,
      winnerName: null,
      published: false,
    });

    // Phase 3+: question-1 … grade-5, waitForEvent, finale, waitForApproval
    step.reportComplete({ topic, rounds: TOTAL_ROUNDS });
  }
}

export class QuizAgent extends Agent<Env, QuizState> {
  initialState: QuizState = initialQuizState();

  async onWorkflowComplete(
    workflowName: string,
    workflowId: string,
    result?: unknown,
  ) {
    console.log(workflowName, workflowId, "finished with result:", result);
  }

  /** Phase 2: join / submitAnswer / closeRound / publishResults */
  @callable()
  async startQuiz(topic: string) {
    const trimmed = topic.trim();
    if (!trimmed) {
      throw new Error("Topic is required");
    }
    if (this.state.status !== "lobby" && this.state.status !== "done") {
      throw new Error("Quiz already in progress");
    }

    this.setState({
      ...initialQuizState(),
      status: "generating",
      topic: trimmed,
      participants: this.state.participants,
      scores: Object.fromEntries(
        this.state.participants.map((p) => [p.name, 0]),
      ),
    });

    const workflowId = await this.runWorkflow("QUIZ_WORKFLOW", {
      topic: trimmed,
    });

    this.setState({
      ...this.state,
      workflowId,
    });

    return { workflowId };
  }
}

export default {
  async fetch(request, env) {
    return (
      (await routeAgentRequest(request, env)) ??
      new Response("Not found", { status: 404 })
    );
  },
} satisfies ExportedHandler<Env>;
