import { tool } from "ai";
import { z } from "zod";

export const timezonePrompt =
  "You can get the user's timezone from their browser.";

export function createTimezoneTools() {
  return {
    // Client-side tool: no execute function — the browser handles it
    getUserTimezone: tool({
      description:
        "Get the user's timezone from their browser. Use this when you need to know the user's local time.",
      inputSchema: z.object({})
    })
  };
}
