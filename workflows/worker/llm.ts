import { generateText, Output } from "ai";
import { createWorkersAI } from "workers-ai-provider";
import type { z } from "zod";
import {
  GradeResultSchema,
  QuestionSchema,
  type GradeResult,
  type Question,
  type SubmittedAnswer,
} from "./types";

const MODEL = "@cf/meta/llama-4-scout-17b-16e-instruct" as const;

export const GRADE_RETRIES = {
  limit: 5,
  delay: "3 seconds" as const,
  backoff: "exponential" as const,
};

function extractJsonObject(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1]?.trim() ?? text.trim();
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("No JSON object found in model response");
  }
  return JSON.parse(candidate.slice(start, end + 1));
}

async function generateStructured<T>(
  ai: Ai,
  schema: z.ZodType<T>,
  prompt: string,
  rawJsonHint: string,
): Promise<T> {
  const workersai = createWorkersAI({ binding: ai });
  const model = workersai(MODEL);

  try {
    const { output } = await generateText({
      model,
      prompt,
      output: Output.object({ schema }),
    });
    if (output == null) {
      throw new Error("No object generated from Output.object");
    }
    return schema.parse(output);
  } catch (structuredError) {
    const { text } = await generateText({
      model,
      prompt: [
        prompt,
        "",
        "Respond with a single raw JSON object only:",
        rawJsonHint,
        `Previous structured error: ${
          structuredError instanceof Error
            ? structuredError.message
            : String(structuredError)
        }`,
      ].join("\n"),
    });
    return schema.parse(extractJsonObject(text));
  }
}

/**
 * Generate a quiz question via Workers AI.
 * Throws on failure so step.do retries can kick in.
 */
export async function generateQuestion(
  ai: Ai,
  args: {
    topic: string;
    round: number;
    totalRounds: number;
    previousQuestions: string[];
  },
): Promise<Question> {
  const previous =
    args.previousQuestions.length > 0
      ? `Previously asked (do NOT repeat):\n- ${args.previousQuestions.join("\n- ")}`
      : "No previous questions yet.";

  const prompt = [
    `You are the host of a live trivia quiz show.`,
    `Topic: ${args.topic}`,
    `This is round ${args.round} of ${args.totalRounds}.`,
    previous,
    ``,
    `Create ONE clear trivia question with a short, definitive correct answer.`,
    `Prefer answers that are a name, year, title, or short phrase (not a long sentence).`,
    `Return only the structured object.`,
  ].join("\n");

  return generateStructured(
    ai,
    QuestionSchema,
    prompt,
    '{"question":"...","correctAnswer":"..."}',
  );
}

/**
 * Grade free-text answers against the recorded correct answer.
 * Accept near-matches (punctuation, hyphenation, minor spelling).
 */
export async function gradeAnswers(
  ai: Ai,
  args: {
    question: string;
    correctAnswer: string;
    answers: SubmittedAnswer[];
  },
): Promise<GradeResult> {
  if (args.answers.length === 0) {
    return { grades: [] };
  }

  const submissions = args.answers
    .map((a) => `- ${a.playerName}: ${JSON.stringify(a.text)}`)
    .join("\n");

  const prompt = [
    `You are grading a live trivia quiz round.`,
    `Question: ${args.question}`,
    `Official correct answer: ${args.correctAnswer}`,
    ``,
    `Player submissions:`,
    submissions,
    ``,
    `For EACH player, decide if their answer is correct enough.`,
    `Treat answers as correct when they clearly mean the same thing despite`,
    `hyphens, spacing, capitalization, or minor spelling differences`,
    `(example: "Bong Joon-ho" vs "Bong Joon Ho" should both score).`,
    `points: 1 if correct/close enough, otherwise 0.`,
    `Include every playerName from the submissions exactly once.`,
    `Return only the structured grades object.`,
  ].join("\n");

  const result = await generateStructured(
    ai,
    GradeResultSchema,
    prompt,
    '{"grades":[{"playerName":"...","correct":true,"points":1,"reason":"..."}]}',
  );

  const byName = new Map(result.grades.map((g) => [g.playerName, g]));
  const grades = args.answers.map((a) => {
    const existing = byName.get(a.playerName);
    if (existing) {
      const awarded =
        existing.correct || existing.points > 0 ? Math.max(1, existing.points) : 0;
      return {
        ...existing,
        points: awarded,
        correct: awarded > 0,
      };
    }
    return {
      playerName: a.playerName,
      correct: false,
      points: 0,
      reason: "No grade returned for this player",
    };
  });

  return GradeResultSchema.parse({ grades });
}
