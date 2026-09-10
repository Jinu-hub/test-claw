import { Agent, callable, getCurrentAgent, routeAgentRequest } from "agents";
import {
  AgentWorkflow,
  type AgentWorkflowEvent,
  type AgentWorkflowStep,
} from "agents/workflows";
import { generateQuestion, gradeAnswers, generateFinale, GRADE_RETRIES } from "./llm";
import {
  initialQuizState,
  type LeaderboardEntry,
  type Question,
  type QuizState,
  type RoundSnapshot,
  TOTAL_ROUNDS,
} from "./types";

type Params = {
  topic: string;
};

type ConnectionPlayerState = {
  playerName?: string;
};

const ANSWER_WINDOW = "60 seconds" as const;

const QUESTION_RETRIES = {
  limit: 5,
  delay: "3 seconds" as const,
  backoff: "exponential" as const,
};

/** Workflow waitForEvent type / step name for round N. */
export function closeEventType(round: number): string {
  return `close-${round}`;
}

function questionStepName(round: number): string {
  return `question-${round}`;
}

function gradeStepName(round: number): string {
  return `grade-${round}`;
}

function buildLeaderboard(scores: Record<string, number>): LeaderboardEntry[] {
  return Object.entries(scores)
    .map(([name, score]) => ({ name, score }))
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
}

type ClosePayload = {
  round: number;
  closedAt: number;
  reason?: string;
};

/**
 * Quiz host workflow — fixed step names question-N / close-N / grade-N / finale.
 * Phase 6: finale announcement + waitForApproval before public publish.
 */
export class QuizWorkflow extends AgentWorkflow<QuizAgent, Params> {
  async run(event: AgentWorkflowEvent<Params>, step: AgentWorkflowStep) {
    const topic = event.payload.topic;
    const previousQuestions: string[] = [];
    /** Kept in workflow memory (durable via step.do results) for grading. */
    const roundKeys: Question[] = [];

    await step.mergeAgentState({
      status: "generating",
      topic,
      totalRounds: TOTAL_ROUNDS,
      round: 0,
      question: null,
      correctAnswer: null,
      answerWindowOpen: false,
      answerClosesAt: null,
      answers: [],
      roundHistory: [],
      leaderboard: [],
      finaleText: null,
      winnerName: null,
      published: false,
    });

    for (let round = 1; round <= TOTAL_ROUNDS; round++) {
      const generated = await step.do(
        questionStepName(round),
        { retries: QUESTION_RETRIES },
        async () => {
          return generateQuestion(this.env.AI, {
            topic,
            round,
            totalRounds: TOTAL_ROUNDS,
            previousQuestions,
          });
        },
      );

      previousQuestions.push(generated.question);
      roundKeys.push(generated);

      const closesAt = Date.now() + 60_000;
      await step.mergeAgentState({
        status: "answering",
        round,
        question: generated.question,
        correctAnswer: null,
        answerWindowOpen: true,
        answerClosesAt: closesAt,
        answers: [],
      });

      const eventName = closeEventType(round);
      let closedBy: "host" | "timeout" = "timeout";
      try {
        await step.waitForEvent<ClosePayload>(eventName, {
          type: eventName,
          timeout: ANSWER_WINDOW,
        });
        closedBy = "host";
      } catch {
        closedBy = "timeout";
      }

      await step.mergeAgentState({
        answerWindowOpen: false,
        answerClosesAt: null,
        status: "grading",
      });

      console.log(`round ${round} closed by ${closedBy}`);

      const graded = await step.do(
        gradeStepName(round),
        { retries: GRADE_RETRIES },
        async () => {
          const snapshot = await this.agent.getGradingSnapshot();
          const gradeResult = await gradeAnswers(this.env.AI, {
            question: generated.question,
            correctAnswer: generated.correctAnswer,
            answers: snapshot.answers,
          });

          const scores = { ...snapshot.scores };
          for (const g of gradeResult.grades) {
            scores[g.playerName] = (scores[g.playerName] ?? 0) + g.points;
          }

          const roundSnapshot: RoundSnapshot = {
            round,
            question: generated.question,
            correctAnswer: generated.correctAnswer,
            grades: gradeResult.grades,
          };

          return {
            correctAnswer: generated.correctAnswer,
            scores,
            leaderboard: buildLeaderboard(scores),
            roundHistory: [...snapshot.roundHistory, roundSnapshot],
            grades: gradeResult.grades,
          };
        },
      );

      await step.mergeAgentState({
        status: "reveal",
        correctAnswer: graded.correctAnswer,
        scores: graded.scores,
        leaderboard: graded.leaderboard,
        roundHistory: graded.roundHistory,
      });

      // Brief pause so clients can see the reveal before the next question.
      await step.sleep(`reveal-${round}`, "8 seconds");

      if (round < TOTAL_ROUNDS) {
        await step.mergeAgentState({
          status: "generating",
          question: null,
          correctAnswer: null,
        });
      }
    }

    const finale = await step.do(
      "finale",
      { retries: GRADE_RETRIES },
      async () => {
        const snapshot = await this.agent.getGradingSnapshot();
        return generateFinale(this.env.AI, {
          topic,
          leaderboard: snapshot.leaderboard ?? buildLeaderboard(snapshot.scores),
        });
      },
    );

    await step.mergeAgentState({
      status: "awaiting-publish",
      question: null,
      correctAnswer: null,
      answerWindowOpen: false,
      answerClosesAt: null,
      finaleText: finale.announcement,
      winnerName: finale.winnerName,
      published: false,
    });

    await this.waitForApproval(step, {
      stepName: "wait-for-publish",
      timeout: "7 days",
    });

    await step.mergeAgentState({
      status: "published",
      published: true,
    });

    await step.reportComplete({
      topic,
      rounds: TOTAL_ROUNDS,
      questions: roundKeys.map((q) => q.question),
      winnerName: finale.winnerName,
      published: true,
    });
  }
}

export class QuizAgent extends Agent<Env, QuizState> {
  initialState: QuizState = initialQuizState();

  /** Called from QuizWorkflow after the answer window closes / for finale. */
  async getGradingSnapshot() {
    return {
      answers: this.state.answers,
      scores: this.state.scores,
      roundHistory: this.state.roundHistory,
      leaderboard: this.state.leaderboard,
    };
  }

  async onWorkflowComplete(
    workflowName: string,
    workflowId: string,
    result?: unknown,
  ) {
    console.log(workflowName, workflowId, "finished with result:", result);
    if (this.state.workflowId === workflowId && this.state.status !== "published") {
      this.setState({
        ...this.state,
        status: this.state.status === "done" ? "done" : this.state.status,
        answerWindowOpen: false,
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

  /**
   * Host early-close: closes the local answer window and wakes
   * waitForEvent(`close-${round}`) on the running workflow.
   */
  @callable()
  async closeRound(round?: number) {
    const r = round ?? this.state.round;
    if (r < 1) {
      throw new Error("No active round to close");
    }
    if (!this.state.answerWindowOpen && this.state.status !== "answering") {
      throw new Error("Answer window is not open");
    }

    this.setState({
      ...this.state,
      answerWindowOpen: false,
      answerClosesAt: null,
      status: "grading",
    });

    if (!this.state.workflowId) {
      throw new Error("No active quiz workflow");
    }

    await this.sendWorkflowEvent("QUIZ_WORKFLOW", this.state.workflowId, {
      type: closeEventType(r),
      payload: {
        round: r,
        closedAt: Date.now(),
        reason: "host",
      } satisfies ClosePayload,
    });

    return { round: r, answers: this.state.answers.length };
  }

  /** Approve publish — wakes waitForApproval; workflow then sets published. */
  @callable()
  async publishResults() {
    if (this.state.status !== "awaiting-publish") {
      throw new Error("Results are not ready to publish yet");
    }
    if (!this.state.workflowId) {
      throw new Error("No active quiz workflow");
    }

    await this.approveWorkflow(this.state.workflowId, {
      reason: "Host published quiz results",
      metadata: {
        winnerName: this.state.winnerName,
      },
    });

    return { approved: true };
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
