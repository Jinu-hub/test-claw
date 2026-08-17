import { featureFlags } from "../feature-flags";
import { REALITY_SYSTEM_PROMPT } from "../prompts";
import {
  calculatePrompt,
  createCalculateTools,
  createScheduleTools,
  createTimezoneTools,
  createWeatherTools,
  getSchedulePromptFragment,
  imagesPrompt,
  type McpToolHost,
  timezonePrompt,
  weatherPrompt
} from "../starter";
import {
  createRealityTools,
  realityPrompt,
  type RealityToolHost
} from "./reality";
import {
  createRealityScheduleTools,
  realitySchedulePrompt,
  type RealityScheduleToolHost
} from "./reality-schedule";
import type { ScheduleToolHost } from "./shared";

export function composeSystemPrompt(): string {
  const parts = [REALITY_SYSTEM_PROMPT, realityPrompt, realitySchedulePrompt];

  if (featureFlags.images) parts.push(imagesPrompt);
  if (featureFlags.weather) parts.push(weatherPrompt);
  if (featureFlags.timezone) parts.push(timezonePrompt);
  if (featureFlags.calculate) parts.push(calculatePrompt);
  if (featureFlags.schedule) parts.push(getSchedulePromptFragment());

  return parts.join("\n\n");
}

export function collectServerTools(
  agent: ScheduleToolHost &
    McpToolHost &
    RealityToolHost &
    RealityScheduleToolHost
) {
  return {
    ...createRealityTools(agent),
    ...createRealityScheduleTools(agent),
    ...(featureFlags.mcp ? agent.mcp.getAITools() : {}),
    ...(featureFlags.weather ? createWeatherTools() : {}),
    ...(featureFlags.timezone ? createTimezoneTools() : {}),
    ...(featureFlags.calculate ? createCalculateTools() : {}),
    ...(featureFlags.schedule ? createScheduleTools(agent) : {})
  };
}

export type { McpToolHost };
