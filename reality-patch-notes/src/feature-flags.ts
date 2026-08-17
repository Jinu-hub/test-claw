/**
 * Toggle starter capabilities without deleting their implementations.
 *
 * Product (always on): `src/reality/`, `src/tools/reality.ts`, `src/tools/reality-schedule.ts`
 * Starter demo (off by default): `src/starter/` — see `starter/README.md`
 * Client UI gates: `src/app.tsx` (MCP panel, image attachments)
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
  "새 섹션 테스트 evidence 넣어줘",
  "섹션 제안 목록 보여줘",
  "Cloudflare Agents 다시 스캔해줘"
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
