import z from "zod";

/** Structured case from one advocate — exactly 3 arguments. */
export const ArgumentSchema = z.object({
  stance: z.string().meta({
    description: "The side this advocate represents (e.g. 민초단, 부먹파).",
  }),
  opening: z.string().meta({
    description: "Opening statement introducing the stance.",
  }),
  arguments: z
    .array(
      z.object({
        point: z.string().meta({
          description: "Short title of this argument.",
        }),
        reasoning: z.string().meta({
          description: "Why this point supports the stance.",
        }),
      }),
    )
    .length(3)
    .meta({
      description: "Exactly three distinct supporting arguments.",
    }),
  closing: z.string().meta({
    description: "Closing statement summarizing the case.",
  }),
});

export type DebateCase = z.infer<typeof ArgumentSchema>;

/** Two opposing sides extracted from a free-form debate topic. */
export const StancesSchema = z.object({
  sideA: z.object({
    name: z.string().meta({
      description: "Display name for side A (e.g. 민초단).",
    }),
    stance: z.string().meta({
      description: "One-sentence description of side A's position.",
    }),
  }),
  sideB: z.object({
    name: z.string().meta({
      description: "Display name for side B (e.g. 반민초단).",
    }),
    stance: z.string().meta({
      description: "One-sentence description of side B's position.",
    }),
  }),
});

export type Stances = z.infer<typeof StancesSchema>;

export type DebateStatus =
  | "idle"
  | "extracting"
  | "debating"
  | "judging"
  | "done";

export type OrchestratorState = {
  status: DebateStatus;
  topic?: string;
  sides?: Stances;
  /** Live progress keyed by advocate sub-agent name (e.g. advocate-sideA). */
  activity?: Record<string, string>;
  cases?: {
    sideA?: DebateCase;
    sideB?: DebateCase;
  };
};
