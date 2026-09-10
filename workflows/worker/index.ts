import { Agent, callable, getCurrentAgent, routeAgentRequest } from "agents";
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

type ConnectionPlayerState = {
  playerName?: string;
};

/** Workflow waitForEvent type for round N (Phase 4). */
export function closeEventType(round: number): string {
  return `close-${round}`;
}

/**
 * Phase 1–2 scaffold — full 5-round loop lands in Phase 3–5.
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
    // Scaffold workflow finishes immediately; return to lobby so Host can re-start.
    if (this.state.status === "generating") {
      this.setState({
        ...this.state,
        status: "lobby",
      });
    }
  }

  @callable()
  async join(name: string) {
    const trimmed = name.trim();
    if (!trimmed) {
      throw new Error("Name is required");
    }

    const { connection } = getCurrentAgent<QuizAgent>();
    if (connection) {
      const prev = (connection.state ?? {}) as ConnectionPlayerState;
      connection.setState({ ...prev, playerName: trimmed });
    }

    const existing = this.state.participants.find((p) => p.name === trimmed);
    const participants = existing
      ? this.state.participants
      : [
          ...this.state.participants,
          { name: trimmed, joinedAt: Date.now() },
        ];

    const scores = { ...this.state.scores };
    if (scores[trimmed] == null) {
      scores[trimmed] = 0;
    }

    this.setState({
      ...this.state,
      participants,
      scores,
    });

    return { name: trimmed, participants };
  }

  @callable()
  async submitAnswer(text: string) {
    const trimmed = text.trim();
    if (!trimmed) {
      throw new Error("Answer is required");
    }
    if (!this.state.answerWindowOpen) {
      throw new Error("Answer window is closed");
    }

    const { connection } = getCurrentAgent<QuizAgent>();
    const playerName = (
      connection?.state as ConnectionPlayerState | undefined
    )?.playerName?.trim();
    if (!playerName) {
      throw new Error("Join the quiz before submitting an answer");
    }
    if (!this.state.participants.some((p) => p.name === playerName)) {
      throw new Error("You are not a participant in this room");
    }

    const next: QuizState["answers"] = [
      ...this.state.answers.filter((a) => a.playerName !== playerName),
      {
        playerName,
        text: trimmed,
        submittedAt: Date.now(),
      },
    ];

    this.setState({
      ...this.state,
      answers: next,
    });

    return { playerName, accepted: true };
  }

  /**
   * Host helper until Phase 3–4 open the window from the workflow.
   * Opens a timed answer window and records round number.
   */
  @callable()
  async openAnswers(round = 1, durationSeconds = 60) {
    const r = Math.max(1, Math.floor(round));
    const closesAt = Date.now() + durationSeconds * 1000;
    this.setState({
      ...this.state,
      status: "answering",
      round: r,
      question: this.state.question ?? `(Phase 2 test) Round ${r} question`,
      answerWindowOpen: true,
      answerClosesAt: closesAt,
      answers: [],
      correctAnswer: null,
    });
    return { round: r, answerClosesAt: closesAt };
  }

  @callable()
  async closeRound(round?: number) {
    const r = round ?? this.state.round;
    if (r < 1) {
      throw new Error("No active round to close");
    }

    this.setState({
      ...this.state,
      answerWindowOpen: false,
      answerClosesAt: null,
      status: "grading",
    });

    if (this.state.workflowId) {
      try {
        await this.sendWorkflowEvent("QUIZ_WORKFLOW", this.state.workflowId, {
          type: closeEventType(r),
          payload: { round: r, closedAt: Date.now() },
        });
      } catch (err) {
        // Workflow may not be waiting yet (Phase 2 scaffold) — local close still applies.
        console.log("closeRound sendWorkflowEvent:", err);
      }
    }

    return { round: r, answers: this.state.answers.length };
  }

  @callable()
  async publishResults() {
    if (this.state.status !== "awaiting-publish" && !this.state.finaleText) {
      // Phase 2: allow host to mark published for UI wiring; Phase 6 gates on approval.
      this.setState({
        ...this.state,
        published: true,
        status: "published",
      });
      return { published: true };
    }

    if (this.state.workflowId) {
      await this.approveWorkflow(this.state.workflowId, {
        reason: "Host published quiz results",
      });
    }

    this.setState({
      ...this.state,
      published: true,
      status: "published",
    });

    return { published: true };
  }

  @callable()
  async startQuiz(topic: string) {
    const trimmed = topic.trim();
    if (!trimmed) {
      throw new Error("Topic is required");
    }
    if (
      this.state.status !== "lobby" &&
      this.state.status !== "done" &&
      this.state.status !== "published"
    ) {
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

  @callable()
  async resetRoom() {
    this.setState(initialQuizState());
    return { ok: true };
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
