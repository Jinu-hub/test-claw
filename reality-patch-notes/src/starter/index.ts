/**
 * Agents Starter demo — disabled via `featureFlags` in `src/feature-flags.ts`.
 * See `starter/README.md` for the flag → module map.
 */

export { configureMcpOAuth, type McpToolHost } from "./features/mcp";
export { imagesPrompt } from "./features/images";
export { McpPanel, useMcpState } from "./components/McpPanel";
export { fileToDataUri, useAttachments, type Attachment } from "./hooks/useAttachments";
export { handleClientToolCall } from "./tools/client";
export { calculatePrompt, createCalculateTools } from "./tools/calculate";
export {
  createScheduleTools,
  getSchedulePromptFragment
} from "./tools/schedule";
export { createTimezoneTools, timezonePrompt } from "./tools/timezone";
export { createWeatherTools, weatherPrompt } from "./tools/weather";
