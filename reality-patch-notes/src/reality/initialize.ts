import { createWorkersAI } from "workers-ai-provider";
import { generateText } from "ai";
import type { FetchedSource } from "./fetch";
import { fetchSourceText } from "./fetch";
import { getSourcePack, type SectionBlueprint } from "./sources";
import { persistFetchedEvidence } from "./evidence";
import {
  getCurrentContext,
  parseWatchIntent,
  putCurrentContext,
  upsertTarget,
  type RealityStore
} from "./store";
import type { RealityContext, TargetRow, WatchIntent } from "./types";

export type InitializeRealityResult = {
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

function formatSourcesForPrompt(sources: FetchedSource[]): string {
  return sources
    .filter((source) => source.ok && source.text.length > 0)
    .map(
      (source, index) =>
        `### Source ${index + 1}: ${source.title}
URL: ${source.url}
Publisher: ${source.publisher}

${source.text}`
    )
    .join("\n\n");
}

async function writeSectionBody(input: {
  ai: Ai;
  targetName: string;
  intent: WatchIntent;
  section: SectionBlueprint;
  sources: FetchedSource[];
}): Promise<string> {
  const usable = input.sources.filter((s) => s.ok && s.text);
  if (usable.length === 0) {
    return `Insufficient fetched evidence for ${input.section.title}.
Re-run initialization after source fetch succeeds.
Open question: confirm canonical docs for this section.`;
  }

  const workersai = createWorkersAI({ binding: input.ai });
  const sourceBlock = formatSourcesForPrompt(usable).slice(0, 18000);

  try {
    const result = await generateText({
      model: workersai("@cf/moonshotai/kimi-k2.7-code"),
      prompt: `You are building a Reality Context baseline section for "${input.targetName}".

Section: ${input.section.title} (${input.section.key})
Purpose: ${input.section.purpose}

Watch focus: ${input.intent.focus.join(", ") || "(none)"}
Watch ignore: ${input.intent.ignore.join(", ") || "(none)"}

Rules:
- Use ONLY the provided sources
- Write 2-5 short paragraphs of current baseline reality
- Be concrete but do not invent APIs, limits, or features absent from sources
- If sources are thin for this section, say what is known and what is unconfirmed
- No markdown headings
- No bullet-only dump; short prose is preferred
- English output

Sources:
${sourceBlock}`
    });

    const text = result.text.trim();
    if (text.length > 40) return text;
  } catch {
    // fall through to extractive baseline
  }

  const snippet = usable
    .map((source) => `${source.title}: ${source.text.slice(0, 400)}`)
    .join("\n");
  return `Baseline draft for ${input.section.title} from fetched docs.

${snippet.slice(0, 1200)}

Note: LLM summarization was unavailable or too short; this extractive draft should be refined later.`;
}

export function isRealityInitialized(context: RealityContext | null): boolean {
  if (!context) return false;
  if (context.sections.length === 0) return false;
  if (
    context.sections.length === 1 &&
    context.sections[0].key === "baseline" &&
    context.sections[0].body.toLowerCase().includes("not yet initialized")
  ) {
    return false;
  }
  return context.sections.some((section) => section.key !== "baseline");
}

export async function buildInitialRealityContext(input: {
  store: RealityStore;
  ai: Ai;
  target: TargetRow;
}): Promise<InitializeRealityResult> {
  const pack = getSourcePack(input.target);
  if (!pack) {
    throw new Error(
      `No canonical source pack for "${input.target.name}". Phase 4 currently supports Cloudflare Agents.`
    );
  }

  const intent = parseWatchIntent(input.target.watch_intent_json);
  const existing = await getCurrentContext(input.store, input.target.id);
  const created = existing?.profile.created ?? input.target.created_at;
  const now = new Date().toISOString();

  const fetched: FetchedSource[] = [];
  for (const source of pack.sources) {
    fetched.push(await fetchSourceText(source));
  }

  const okSources = fetched.filter((source) => source.ok);
  if (okSources.length === 0) {
    throw new Error("All canonical source fetches failed.");
  }

  const sections = [];
  for (const section of pack.sections) {
    const body = await writeSectionBody({
      ai: input.ai,
      targetName: input.target.name,
      intent,
      section,
      sources: fetched
    });
    sections.push({
      key: section.key,
      title: section.title,
      body
    });
  }

  const openQuestions = [
    "Which Sandbox limits are stable enough to treat as patch-worthy facts?",
    "Are Browser capabilities experimental-only or generally available for Agents?",
    ...fetched
      .filter((source) => !source.ok)
      .map((source) => `Re-fetch failed source: ${source.url} (${source.error})`)
  ];

  const context: RealityContext = {
    targetId: input.target.id,
    name: input.target.name,
    profile: {
      description:
        existing?.profile.description ||
        input.target.description ||
        `${input.target.name} tracked from official documentation.`,
      category: existing?.profile.category || input.target.category || "technology",
      created,
      lastUpdated: now
    },
    intent,
    sections,
    openQuestions
  };

  const evidence = await persistFetchedEvidence(
    input.store,
    input.target.id,
    fetched
  );

  const objectKey = await putCurrentContext(input.store, context);
  upsertTarget(input.store, {
    id: input.target.id,
    name: input.target.name,
    description: context.profile.description,
    category: context.profile.category,
    status: input.target.status,
    intent,
    createdAt: input.target.created_at,
    updatedAt: now
  });

  return {
    targetId: input.target.id,
    name: input.target.name,
    objectKey,
    sectionKeys: sections.map((section) => section.key),
    sourcesFetched: okSources.length,
    sourcesFailed: fetched.length - okSources.length,
    sourceUrls: okSources.map((source) => source.url),
    evidenceStored: evidence.stored,
    evidenceSkipped: evidence.skipped
  };
}
