import { featureFlags } from "../../feature-flags";

export function handleClientToolCall({
  toolCall,
  addToolOutput
}: {
  toolCall: { toolCallId: string; toolName: string };
  addToolOutput: (args: { toolCallId: string; output: unknown }) => void;
}) {
  if (featureFlags.timezone && toolCall.toolName === "getUserTimezone") {
    addToolOutput({
      toolCallId: toolCall.toolCallId,
      output: {
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        localTime: new Date().toLocaleTimeString()
      }
    });
  }
}
