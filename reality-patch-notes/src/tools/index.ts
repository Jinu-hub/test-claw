import { featureFlags } from "../feature-flags";
import { imagesPrompt } from "../features/images";
import type { McpToolHost } from "../features/mcp";
import { REALITY_SYSTEM_PROMPT } from "../prompts";
import { calculatePrompt, createCalculateTools } from "./calculate";
import { createScheduleTools, getSchedulePromptFragment } from "./schedule";
import { createTimezoneTools, timezonePrompt } from "./timezone";
import { createWeatherTools, weatherPrompt } from "./weather";
import type { ScheduleToolHost } from "./shared";

export function composeSystemPrompt(): string {
  const parts = [REALITY_SYSTEM_PROMPT];

  if (featureFlags.images) parts.push(imagesPrompt);
  if (featureFlags.weather) parts.push(weatherPrompt);
  if (featureFlags.timezone) parts.push(timezonePrompt);
  if (featureFlags.calculate) parts.push(calculatePrompt);
  if (featureFlags.schedule) parts.push(getSchedulePromptFragment());

  return parts.join("\n\n");
}

export function collectServerTools(agent: ScheduleToolHost & McpToolHost) {
  return {
    ...(featureFlags.mcp ? agent.mcp.getAITools() : {}),
    ...(featureFlags.weather ? createWeatherTools() : {}),
    ...(featureFlags.timezone ? createTimezoneTools() : {}),
    ...(featureFlags.calculate ? createCalculateTools() : {}),
    ...(featureFlags.schedule ? createScheduleTools(agent) : {})
  };
}
