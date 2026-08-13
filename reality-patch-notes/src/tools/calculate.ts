import { tool } from "ai";
import { z } from "zod";
import { CALCULATE_APPROVAL_THRESHOLD } from "./shared";

export const calculatePrompt =
  "You can run calculations. Large-number calculations require user approval.";

export function createCalculateTools() {
  return {
    calculate: tool({
      description:
        "Perform a math calculation with two numbers. Requires user approval for large numbers.",
      inputSchema: z.object({
        a: z.number().describe("First number"),
        b: z.number().describe("Second number"),
        operator: z
          .enum(["+", "-", "*", "/", "%"])
          .describe("Arithmetic operator")
      }),
      needsApproval: async ({ a, b }) =>
        Math.abs(a) > CALCULATE_APPROVAL_THRESHOLD ||
        Math.abs(b) > CALCULATE_APPROVAL_THRESHOLD,
      execute: async ({ a, b, operator }) => {
        const ops: Record<string, (x: number, y: number) => number> = {
          "+": (x, y) => x + y,
          "-": (x, y) => x - y,
          "*": (x, y) => x * y,
          "/": (x, y) => x / y,
          "%": (x, y) => x % y
        };
        if (operator === "/" && b === 0) {
          return { error: "Division by zero" };
        }
        return {
          expression: `${a} ${operator} ${b}`,
          result: ops[operator](a, b)
        };
      }
    })
  };
}
