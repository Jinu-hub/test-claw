import { z } from "zod";

export const TOTAL_ROUNDS = 5 as const;

/** LLM question generation — used inside step.do("question-N") */
export const QuestionSchema = z.object({
  question: z.string().min(1),
  correctAnswer: z.string().min(1),
});
export type Question = z.infer<typeof QuestionSchema>;

/** Per-answer grade from LLM — used inside step.do("grade-N") */
export const AnswerGradeSchema = z.object({
  playerName: z.string().min(1),
  correct: z.boolean(),
  points: z.number().int().min(0),
  reason: z.string(),
});

export const GradeResultSchema = z.object({
  grades: z.array(AnswerGradeSchema),
});
export type GradeResult = z.infer<typeof GradeResultSchema>;
export type AnswerGrade = z.infer<typeof AnswerGradeSchema>;

/** Finale announcement — used inside step.do("finale") */
export const FinaleSchema = z.object({
  announcement: z.string().min(1),
  winnerName: z.string().min(1),
});
export type Finale = z.infer<typeof FinaleSchema>;

export type QuizStatus =
  | "lobby"
  | "generating"
  | "answering"
  | "grading"
  | "reveal"
  | "awaiting-publish"
  | "published"
  | "done";

export type Participant = {
  name: string;
  joinedAt: number;
};

export type SubmittedAnswer = {
  playerName: string;
  text: string;
  submittedAt: number;
};

export type LeaderboardEntry = {
  name: string;
  score: number;
};

export type RoundSnapshot = {
  round: number;
  question: string;
  correctAnswer: string;
  grades: AnswerGrade[];
};

export type QuizState = {
  status: QuizStatus;
  topic: string;
  workflowId: string | null;
  round: number;
  totalRounds: number;
  /** Current question text (correctAnswer stays server-side until reveal) */
  question: string | null;
  /** Revealed only after grading */
  correctAnswer: string | null;
  answerWindowOpen: boolean;
  answerClosesAt: number | null;
  participants: Participant[];
  /** Answers for the current open round */
  answers: SubmittedAnswer[];
  scores: Record<string, number>;
  leaderboard: LeaderboardEntry[];
  roundHistory: RoundSnapshot[];
  finaleText: string | null;
  winnerName: string | null;
  published: boolean;
};

export const initialQuizState = (): QuizState => ({
  status: "lobby",
  topic: "",
  workflowId: null,
  round: 0,
  totalRounds: TOTAL_ROUNDS,
  question: null,
  correctAnswer: null,
  answerWindowOpen: false,
  answerClosesAt: null,
  participants: [],
  answers: [],
  scores: {},
  leaderboard: [],
  roundHistory: [],
  finaleText: null,
  winnerName: null,
  published: false,
});

/** @deprecated Pizza demo — removed in Phase 2+; kept only if referenced during migration */
export type State = QuizState;
