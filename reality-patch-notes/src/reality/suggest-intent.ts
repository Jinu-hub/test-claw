import { createWorkersAI } from "workers-ai-provider";
import { generateText, Output } from "ai";
import { z } from "zod";
import { getSourcePack } from "./sources";
import { getTarget, parseWatchIntent } from "./store";
import { upsertPendingIntentProposal } from "./intent-proposals";
import type { RealityStore } from "./store";
import type { TargetRow } from "./types";

const suggestIntentSchema = z.object({
  focus: z.array(z.string()).describe("Topics to watch for meaningful changes"),
  ignore: z.array(z.string()).describe("Topics to deprioritize or skip"),
  priority: z
    .array(z.string())
    .describe("Highest-signal subset of focus; can match focus if unsure"),
  rationale: z
    .string()
    .describe("Short user-facing explanation of the suggestion in 1-3 sentences")
});

export type SuggestWatchIntentResult = {
  targetId: string;
  name: string;
  proposalId: string;
  focus: string[];
  ignore: string[];
  priority: string[];
  rationale: string;
};

function extractJsonObject(text: string): unknown {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = (fenced?.[1] ?? trimmed).trim();
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) {
    throw new Error("Suggest-intent model returned no JSON object");
  }
  return JSON.parse(raw.slice(start, end + 1)) as unknown;
}

export function isWatchIntentEmpty(intent: {
  focus: string[];
  ignore: string[];
  priority: string[];
}): boolean {
  return (
    intent.focus.length === 0 &&
    intent.ignore.length === 0 &&
    intent.priority.length === 0
  );
}

export async function suggestWatchIntentForTarget(input: {
  store: RealityStore;
  ai: Ai;
  target: TargetRow;
}): Promise<SuggestWatchIntentResult> {
  const { store, ai, target } = input;
  const pack = getSourcePack(target);
  const sectionHints =
    pack?.sections.map((s) => `- ${s.key}: ${s.title} — ${s.purpose}`).join("\n") ??
    "(no canonical source pack yet — infer from target name and category)";

  const currentIntent = parseWatchIntent(target.watch_intent_json);
  const workersai = createWorkersAI({ binding: ai });

  try {
    const result = await generateText({
      model: workersai("@cf/moonshotai/kimi-k2.7-code"),
      output: Output.object({ schema: suggestIntentSchema }),
      prompt: `You suggest Watch Intent for Reality Patch Notes.

Target: ${target.name}
Description: ${target.description || "(none)"}
Category: ${target.category || "general"}
Current intent (may be empty):
- Focus: ${currentIntent.focus.join(", ") || "(none)"}
- Ignore: ${currentIntent.ignore.join(", ") || "(none)"}
- Priority: ${currentIntent.priority.join(", ") || "(none)"}

Known section areas (if any):
${sectionHints}

Rules:
- focus = what meaningful changes matter for patch notes
- ignore = noise the user likely does not want (e.g. daily price for Bitcoin if ETF/regulation matter more)
- priority = highest-signal items; usually a subset of focus
- Use short English snake-case or common terms (price, regulation, etf, adoption) when possible
- rationale = 1-3 sentences in the user's language if target name is non-English, else English
- Do NOT claim anything was saved; this is only a proposal`
    });
    if (result.output) {
      const proposal = upsertPendingIntentProposal(store, {
        targetId: target.id,
        focus: result.output.focus,
        ignore: result.output.ignore,
        priority: result.output.priority,
        rationale: result.output.rationale
      });
      return {
        targetId: target.id,
        name: target.name,
        proposalId: proposal.id,
        focus: proposal.focus,
        ignore: proposal.ignore,
        priority: proposal.priority,
        rationale: proposal.rationale
      };
    }
  } catch {
    // fall through to text JSON parse
  }

  const fallback = await generateText({
    model: workersai("@cf/moonshotai/kimi-k2.7-code"),
    prompt: `You suggest Watch Intent for Reality Patch Notes.

Target: ${target.name}
Description: ${target.description || "(none)"}
Category: ${target.category || "general"}

Respond with JSON only:
{"focus":[],"ignore":[],"priority":[],"rationale":"..."}`
  });

  const parsed = suggestIntentSchema.parse(extractJsonObject(fallback.text));
  const proposal = upsertPendingIntentProposal(store, {
    targetId: target.id,
    focus: parsed.focus,
    ignore: parsed.ignore,
    priority: parsed.priority,
    rationale: parsed.rationale
  });

  return {
    targetId: target.id,
    name: target.name,
    proposalId: proposal.id,
    focus: proposal.focus,
    ignore: proposal.ignore,
    priority: proposal.priority,
    rationale: proposal.rationale
  };
}

export async function runSuggestWatchIntent(
  store: RealityStore,
  ai: Ai,
  targetId: string
): Promise<SuggestWatchIntentResult> {
  const target = getTarget(store, targetId);
  if (!target) {
    throw new Error(`Target not found: ${targetId}`);
  }
  return suggestWatchIntentForTarget({ store, ai, target });
}
