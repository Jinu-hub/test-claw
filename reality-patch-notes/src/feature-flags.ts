/**
 * Toggle starter capabilities without deleting their implementations.
 *
 * Server tools: `src/tools/*.ts`, composed in `src/tools/index.ts`
 * Non-tool capabilities: `src/features/` (MCP, images)
 * Client UI: gated in `src/app.tsx` (MCP panel, image attachments, example prompts)
 *
 * Phase 1–2: demo tools stay implemented but off. Reality prompts/tools are always on.
 */
export const featureFlags = {
  weather: false,
  timezone: false,
  calculate: false,
  schedule: false,
  mcp: false,
  images: false
} as const;

export type FeatureId = keyof typeof featureFlags;

const REALITY_EXAMPLE_PROMPTS = [
  "Cloudflare Agents 근거가 뭐야?",
  "같은 문서 다시 수집해봐.",
  "Sandbox가 지금 어떤 상태야?"
];

const examplePromptsByFeature: Record<FeatureId, string[]> = {
  weather: ["What's the weather in Paris?"],
  timezone: ["What timezone am I in?"],
  calculate: ["Calculate 5000 * 3"],
  schedule: ["Remind me in 5 minutes to take a break"],
  mcp: [],
  images: []
};

export function getExamplePrompts(): string[] {
  const featurePrompts = (Object.keys(featureFlags) as FeatureId[])
    .filter((id) => featureFlags[id])
    .flatMap((id) => examplePromptsByFeature[id]);

  return [...REALITY_EXAMPLE_PROMPTS, ...featurePrompts];
}
