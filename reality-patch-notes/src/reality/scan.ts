import { createWorkersAI } from "workers-ai-provider";
import { generateText, Output } from "ai";
import { z } from "zod";
import {
  ingestFetchedEvidence,
  listUncomparedEvidences,
  loadEvidenceText,
  markEvidenceCompared,
  summarizeEvidence
} from "./evidence";
import { fetchSourceText } from "./fetch";
import { isRealityInitialized } from "./initialize";
import { replaceSectionBody } from "./markdown";
import { insertPatch, insertScanRun, type PatchSummary } from "./patches";
import { getSourcePack } from "./sources";
import {
  getCurrentContext,
  parseWatchIntent,
  putCurrentContext,
  upsertTarget,
  type RealityStore
} from "./store";
import type {
  ContextSection,
  EvidenceRow,
  PatchType,
  TargetRow,
  WatchIntent
} from "./types";

const SANDBOX_TEST_BASELINE = "Sandbox sessions currently last 10 minutes.";
const SANDBOX_TEST_AFTER = "Sandbox sessions currently last 30 minutes.";

const compareSchema = z.object({
  changed: z.boolean(),
  reason: z.string(),
  patches: z
    .array(
      z.object({
        type: z.enum(["ADDED", "CHANGED", "REMOVED", "DEPRECATED"]),
        sectionKey: z.string(),
        title: z.string(),
        summary: z.string(),
        before: z.string(),
        after: z.string(),
        impact: z.string(),
        updatedSectionBody: z.string()
      })
    )
    .default([])
});

type CompareOutput = z.infer<typeof compareSchema>;

export type ScanTargetResult = {
  targetId: string;
  name: string;
  scanRunId: string;
  fetched: number;
  stored: number;
  skipped: number;
  failed: number;
  pendingCompared: number;
  ignored: number;
  llmCalled: boolean;
  patchesCreated: number;
  patchedSectionKeys: string[];
  patches: PatchSummary[];
  message: string;
};

function formatSections(sections: ContextSection[]): string {
  return sections
    .map(
      (section) => `### ${section.title}
section_key: ${section.key}

${section.body}`
    )
    .join("\n\n");
}

function matchesIntentTerm(text: string, term: string): boolean {
  const needle = term.trim().toLowerCase();
  if (!needle) return false;
  return text.toLowerCase().includes(needle);
}

export function isIgnoredByWatchIntent(
  text: string,
  intent: WatchIntent
): boolean {
  if (intent.ignore.length === 0) return false;
  const ignoreHit = intent.ignore.some((term) => matchesIntentTerm(text, term));
  if (!ignoreHit) return false;

  const watchTerms = [...intent.focus, ...intent.priority];
  if (watchTerms.length === 0) return true;
  return !watchTerms.some((term) => matchesIntentTerm(text, term));
}

function extractJsonObject(text: string): unknown {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = (fenced?.[1] ?? trimmed).trim();
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) {
    throw new Error("Compare model returned no JSON object");
  }
  return JSON.parse(raw.slice(start, end + 1)) as unknown;
}

async function runSemanticCompare(input: {
  ai: Ai;
  targetName: string;
  intent: WatchIntent;
  sections: ContextSection[];
  evidenceBlock: string;
}): Promise<CompareOutput> {
  const allowedKeys = input.sections.map((section) => section.key);
  const prompt = `You compare CURRENT REALITY against NEW EVIDENCE for "${input.targetName}".

Product rule: Do not regenerate reality. Patch reality.
changed: false is the CORRECT and usual success when evidence restates, paraphrases, or adds no material fact.

Watch focus: ${input.intent.focus.join(", ") || "(none)"}
Watch ignore: ${input.intent.ignore.join(", ") || "(none)"}
Allowed section keys (existing only): ${allowedKeys.join(", ")}

Create a patch ONLY when evidence shows:
- a concrete fact that contradicts current reality, or
- a new user-relevant capability, limit, or API now known, or
- removal/deprecation of something previously believed

Do NOT patch for wording, marketing, ignored topics, or facts already in the section.
Never invent a new section_key. Prefer exactly one patch when only one area changed.
If changed, updatedSectionBody must be the existing section with ONLY the changed fact edited. Keep other sentences. No markdown headings.

CURRENT REALITY:
${formatSections(input.sections)}

NEW EVIDENCE:
${input.evidenceBlock}`;

  const workersai = createWorkersAI({ binding: input.ai });
  const model = workersai("@cf/moonshotai/kimi-k2.7-code");

  try {
    const result = await generateText({
      model,
      output: Output.object({ schema: compareSchema }),
      prompt
    });
    if (result.output) return result.output;
  } catch {
    // Workers AI may not support structured output; fall through.
  }

  const fallback = await generateText({
    model,
    prompt: `${prompt}

Respond with JSON only:
{"changed":false,"reason":"...","patches":[]}
or patches with type, sectionKey, title, summary, before, after, impact, updatedSectionBody.`
  });

  return compareSchema.parse(extractJsonObject(fallback.text));
}

export async function scanTarget(input: {
  store: RealityStore;
  ai: Ai;
  target: TargetRow;
}): Promise<ScanTargetResult> {
  const { store, ai, target } = input;
  const pack = getSourcePack(target);
  if (!pack) {
    throw new Error(
      `No canonical source pack for "${target.name}". Phase 6 currently supports Cloudflare Agents.`
    );
  }

  const context = await getCurrentContext(store, target.id);
  if (!isRealityInitialized(context) || !context) {
    throw new Error(
      `Reality for "${target.name}" is not initialized. Run initializeReality first.`
    );
  }

  const startedAt = new Date().toISOString();
  const intent = parseWatchIntent(target.watch_intent_json);
  let stored = 0;
  let skipped = 0;
  let failed = 0;
  let fetched = 0;

  for (const source of pack.sources) {
    const fetchedSource = await fetchSourceText(source);
    if (fetchedSource.ok) fetched += 1;
    const result = await ingestFetchedEvidence(store, target.id, fetchedSource);
    if ("error" in result) {
      failed += 1;
      continue;
    }
    if (result.skipped) skipped += 1;
    else stored += 1;
  }

  const pending = listUncomparedEvidences(store, target.id);
  const ignoredRows: EvidenceRow[] = [];
  const comparable: EvidenceRow[] = [];

  for (const row of pending) {
    const text = await loadEvidenceText(store, row);
    if (isIgnoredByWatchIntent(`${row.title}\n${text}`, intent)) {
      ignoredRows.push(row);
    } else {
      comparable.push(row);
    }
  }

  const comparedAt = new Date().toISOString();
  markEvidenceCompared(
    store,
    ignoredRows.map((row) => row.id),
    comparedAt
  );

  let llmCalled = false;
  const patches: PatchSummary[] = [];
  let nextContext = context;

  if (comparable.length > 0) {
    const evidenceParts: string[] = [];
    for (const row of comparable) {
      const text = (await loadEvidenceText(store, row)).slice(0, 6000);
      evidenceParts.push(
        `Evidence ${row.id}
Title: ${row.title}
URL: ${row.url}
Publisher: ${row.publisher ?? ""}

${text}`
      );
    }

    llmCalled = true;
    const comparison = await runSemanticCompare({
      ai,
      targetName: target.name,
      intent,
      sections: nextContext.sections,
      evidenceBlock: evidenceParts.join("\n\n")
    });

    const evidenceIds = comparable.map((row) => row.id);
    const allowed = new Set(nextContext.sections.map((section) => section.key));

    if (comparison.changed) {
      for (const candidate of comparison.patches) {
        if (!allowed.has(candidate.sectionKey)) continue;
        const existing = nextContext.sections.find(
          (section) => section.key === candidate.sectionKey
        );
        if (!existing) continue;

        const updatedBody =
          candidate.updatedSectionBody.trim().length > 20
            ? candidate.updatedSectionBody.trim()
            : existing.body;
        if (updatedBody === existing.body.trim()) continue;
        const patched = replaceSectionBody(
          nextContext,
          candidate.sectionKey,
          updatedBody,
          comparedAt
        );
        if (!patched) continue;
        if (patched.sections.length !== nextContext.sections.length) continue;

        nextContext = patched;
        patches.push(
          insertPatch(store, {
            targetId: target.id,
            sectionKey: candidate.sectionKey,
            type: candidate.type as PatchType,
            title: candidate.title,
            summary: candidate.summary,
            before: candidate.before || existing.body.slice(0, 400),
            after: candidate.after || updatedBody.slice(0, 400),
            impact: candidate.impact,
            evidenceIds
          })
        );
      }
    }

    markEvidenceCompared(store, evidenceIds, comparedAt);
  }

  if (patches.length > 0) {
    await putCurrentContext(store, nextContext);
    upsertTarget(store, {
      id: target.id,
      name: target.name,
      description: target.description,
      category: target.category,
      status: target.status,
      intent,
      createdAt: target.created_at,
      updatedAt: comparedAt
    });
  }

  const patchedSectionKeys = [
    ...new Set(patches.map((patch) => patch.sectionKey))
  ];
  const notes = JSON.stringify({
    fetched,
    stored,
    skipped,
    failed,
    pendingCompared: comparable.length,
    ignored: ignoredRows.length,
    llmCalled,
    patchesCreated: patches.length,
    patchedSectionKeys
  });
  const scanRunId = insertScanRun(store, {
    targetId: target.id,
    status: "complete",
    notes,
    startedAt,
    finishedAt: new Date().toISOString()
  });

  const unchanged =
    patches.length === 0 && stored === 0 && comparable.length === 0;
  const message = unchanged
    ? "No new evidence to compare. Identical hashes were skipped. Patch 0 is success."
    : patches.length === 0
      ? `Compared ${comparable.length} evidence item(s); no meaningful change. Patch 0 is success.`
      : `Created ${patches.length} patch(es) for ${patchedSectionKeys.join(", ")}.`;

  return {
    targetId: target.id,
    name: target.name,
    scanRunId,
    fetched,
    stored,
    skipped,
    failed,
    pendingCompared: comparable.length,
    ignored: ignoredRows.length,
    llmCalled,
    patchesCreated: patches.length,
    patchedSectionKeys,
    patches,
    message
  };
}

export async function injectSandboxSessionTestEvidence(
  store: RealityStore,
  target: TargetRow
): Promise<{
  injected: boolean;
  baselineSeeded: boolean;
  evidence: ReturnType<typeof summarizeEvidence> | null;
  message: string;
}> {
  const context = await getCurrentContext(store, target.id);
  if (!isRealityInitialized(context) || !context) {
    return {
      injected: false,
      baselineSeeded: false,
      evidence: null,
      message:
        "Reality is not initialized. Run initializeReality before injecting a test change."
    };
  }

  const sandbox = context.sections.find((section) => section.key === "sandbox");
  if (!sandbox) {
    return {
      injected: false,
      baselineSeeded: false,
      evidence: null,
      message:
        "No sandbox section exists. Phase 6 will not auto-create sections."
    };
  }

  let baselineSeeded = false;
  let working = context;
  if (!/10\s*minutes?/i.test(sandbox.body)) {
    const seeded = replaceSectionBody(
      working,
      "sandbox",
      `${sandbox.body.trim()}\n\n${SANDBOX_TEST_BASELINE}`,
      new Date().toISOString()
    );
    if (!seeded) {
      return {
        injected: false,
        baselineSeeded: false,
        evidence: null,
        message: "Failed to seed the 10-minute sandbox baseline."
      };
    }
    working = seeded;
    await putCurrentContext(store, working);
    baselineSeeded = true;
  }

  const nonce = crypto.randomUUID();
  const result = await ingestFetchedEvidence(store, target.id, {
    url: `https://developers.cloudflare.com/sandbox/?synthetic=session-duration&nonce=${nonce}`,
    title: "Sandbox session duration (synthetic test)",
    publisher: "Reality Patch Notes Test",
    sourceType: "synthetic_test",
    ok: true,
    text: `SYNTHETIC TEST EVIDENCE (not a live Cloudflare document).
Nonce: ${nonce}

Cloudflare Sandbox session duration has changed.
Previous limit: 10 minutes.
Current limit: 30 minutes.
${SANDBOX_TEST_AFTER}
After 30 minutes the isolated execution environment is recycled.`
  });

  if ("error" in result) {
    return {
      injected: false,
      baselineSeeded,
      evidence: null,
      message: result.error
    };
  }

  if (result.skipped) {
    return {
      injected: false,
      baselineSeeded,
      evidence: result.evidence,
      message:
        "Synthetic evidence matched an existing hash and was skipped. Scan will not see a new change."
    };
  }

  return {
    injected: true,
    baselineSeeded,
    evidence: result.evidence,
    message: baselineSeeded
      ? "Seeded sandbox baseline (10 minutes) and stored synthetic evidence (30 minutes). Run scanTarget next."
      : "Stored synthetic evidence that sandbox sessions last 30 minutes. Run scanTarget next."
  };
}
