import { getSchedulePrompt, scheduleSchema } from "agents/schedule";
import { tool } from "ai";
import { z } from "zod";
import type { ScheduleToolHost } from "../../tools/shared";

export function getSchedulePromptFragment(): string {
  return `${getSchedulePrompt({ date: new Date() })}

If the user asks to schedule a task, use the schedule tool to schedule the task.`;
}

export function createScheduleTools(agent: ScheduleToolHost) {
  return {
    scheduleTask: tool({
      description:
        "Schedule a task to be executed at a later time. Use this when the user asks to be reminded or wants something done later.",
      inputSchema: scheduleSchema,
      execute: async ({ when, description }) => {
        if (when.type === "no-schedule") {
          return "Not a valid schedule input";
        }
        const input =
          when.type === "scheduled"
            ? when.date
            : when.type === "delayed"
              ? when.delayInSeconds
              : when.type === "cron"
                ? when.cron
                : null;
        if (!input) return "Invalid schedule type";
        try {
          agent.schedule(input, "executeTask", description, {
            idempotent: true
          });
          return `Task scheduled: "${description}" (${when.type}: ${input})`;
        } catch (error) {
          return `Error scheduling task: ${error}`;
        }
      }
    }),

    getScheduledTasks: tool({
      description: "List all tasks that have been scheduled",
      inputSchema: z.object({}),
      execute: async () => {
        const tasks = agent.getSchedules();
        return tasks.length > 0 ? tasks : "No scheduled tasks found.";
      }
    }),

    cancelScheduledTask: tool({
      description: "Cancel a scheduled task by its ID",
      inputSchema: z.object({
        taskId: z.string().describe("The ID of the task to cancel")
      }),
      execute: async ({ taskId }) => {
        try {
          agent.cancelSchedule(taskId);
          return `Task ${taskId} cancelled.`;
        } catch (error) {
          return `Error cancelling task: ${error}`;
        }
      }
    })
  };
}
