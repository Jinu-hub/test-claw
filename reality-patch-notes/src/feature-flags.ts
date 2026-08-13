/**
 * Toggle starter capabilities without deleting their implementations.
 *
 * Server tools: `src/tools/*.ts`, composed in `src/tools/index.ts`
 * Non-tool capabilities: `src/features/` (MCP, images)
 * Client UI: gated in `src/app.tsx` (MCP panel, image attachments, example prompts)
 */
export const featureFlags = {
  weather: true,
  timezone: true,
  calculate: true,
  schedule: true,
  mcp: true,
  images: true
} as const;

export type FeatureId = keyof typeof featureFlags;

const examplePromptsByFeature: Record<FeatureId, string[]> = {
  weather: ["What's the weather in Paris?"],
  timezone: ["What timezone am I in?"],
  calculate: ["Calculate 5000 * 3"],
  schedule: ["Remind me in 5 minutes to take a break"],
  mcp: [],
  images: []
};

export function getExamplePrompts(): string[] {
  return (Object.keys(featureFlags) as FeatureId[])
    .filter((id) => featureFlags[id])
    .flatMap((id) => examplePromptsByFeature[id]);
}
