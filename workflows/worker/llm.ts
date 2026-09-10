import { generateText, Output } from "ai";
import { createWorkersAI } from "workers-ai-provider";
import { QuestionSchema, type Question } from "./types";

const MODEL = "@cf/meta/llama-4-scout-17b-16e-instruct" as const;

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
  const workersai = createWorkersAI({ binding: ai });
  const model = workersai(MODEL);

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

  try {
    const { output } = await generateText({
      model,
      prompt,
      output: Output.object({ schema: QuestionSchema }),
    });
    if (output == null) {
      throw new Error("No object generated from Output.object");
    }
    return QuestionSchema.parse(output);
  } catch (structuredError) {
    // Fallback: plain JSON text — still throw on failure so step.do retries.
    const { text } = await generateText({
      model,
      prompt: [
        prompt,
        "",
        "Respond with a single raw JSON object only:",
        '{"question":"...","correctAnswer":"..."}',
        `Previous structured error: ${
          structuredError instanceof Error
            ? structuredError.message
            : String(structuredError)
        }`,
      ].join("\n"),
    });
    return QuestionSchema.parse(extractJsonObject(text));
  }
}
