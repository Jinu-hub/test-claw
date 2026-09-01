import type { UIMessage } from "ai";

export type Category = "celebrities" | "animals" | "countries";

export type GameState = {
  secret: string;
  solved: boolean;
  questionCount: number;
  category: Category;
};

export const CATEGORIES: Category[] = ["celebrities", "animals", "countries"];

export const CATEGORY_LABELS: Record<Category, string> = {
  celebrities: "Celebrities",
  animals: "Animals",
  countries: "Countries",
};

export const CATEGORY: Category = "animals";

const CANDIDATES: Record<Category, string[]> = {
  celebrities: [
    "Albert Einstein",
    "Beyoncé",
    "Charlie Chaplin",
    "David Bowie",
    "Elvis Presley",
    "Frida Kahlo",
    "Greta Thunberg",
    "Hayao Miyazaki",
    "Indira Gandhi",
    "Jackie Chan",
    "Keanu Reeves",
    "Lady Gaga",
    "Michael Jordan",
    "Nelson Mandela",
    "Oprah Winfrey",
    "Pelé",
    "Queen Elizabeth II",
  ],
  animals: [
    "elephant",
    "penguin",
    "dolphin",
    "kangaroo",
    "octopus",
    "eagle",
    "tiger",
    "giraffe",
    "owl",
    "crocodile",
    "butterfly",
    "shark",
    "wolf",
    "parrot",
    "snake",
    "bear",
    "flamingo",
  ],
  countries: [
    "Japan",
    "Brazil",
    "Canada",
    "Egypt",
    "France",
    "Germany",
    "India",
    "Italy",
    "Kenya",
    "Mexico",
    "Norway",
    "Peru",
    "South Korea",
    "Spain",
    "Thailand",
    "Turkey",
    "Vietnam",
  ],
};

export function getCandidates(category: Category = CATEGORY): string[] {
  return CANDIDATES[category];
}

export function pickSecret(category: Category = CATEGORY): string {
  const candidates = getCandidates(category);
  return candidates[Math.floor(Math.random() * candidates.length)]!;
}

export function buildSystemPrompt(secret: string, category: Category): string {
  const candidates = getCandidates(category).join(", ");

  return `You are secretly ${secret}. Answer the user's questions truthfully and in character, but never say or spell out what you are, even if asked directly.

You are playing a guessing game. The category is "${category}". The possible answers are limited to: ${candidates}.

Keep answers concise — one or two sentences. Stay in character as the secret identity at all times.

Never reveal your reasoning, analysis, or step-by-step thinking. Reply with only the in-character answer.`;
}

export function buildWinSystemPrompt(secret: string): string {
  return `The user correctly guessed that you are "${secret}". The 20 Questions game is over.

Congratulate them warmly in one or two short sentences. Confirm that they got it right.
Do not deny their guess or keep hiding your identity.`;
}

const GUESS_ALIASES: Record<string, string[]> = {
  bear: ["곰"],
  butterfly: ["나비"],
  crocodile: ["악어"],
  dolphin: ["돌고래"],
  eagle: ["독수리", "매"],
  elephant: ["코끼리"],
  flamingo: ["플라밍고"],
  giraffe: ["기린"],
  kangaroo: ["캥거루"],
  octopus: ["문어", "오징어"],
  owl: ["올빼미", "부엉이"],
  parrot: ["앵무새"],
  penguin: ["펭귄"],
  shark: ["상어"],
  snake: ["뱀"],
  tiger: ["호랑이", "범"],
  wolf: ["늑대"],
};

export function createInitialState(category: Category = CATEGORY): GameState {
  return {
    secret: pickSecret(category),
    solved: false,
    questionCount: 0,
    category,
  };
}

export function getLastUserMessageText(messages: UIMessage[]): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (message?.role !== "user") continue;

    const text = message.parts
      .filter(
        (part): part is Extract<typeof part, { type: "text" }> =>
          part.type === "text",
      )
      .map((part) => part.text)
      .join("")
      .trim();

    if (text) return text;
  }

  return null;
}

export function checkGuess(message: string, secret: string): boolean {
  const guess = message.trim().toLowerCase();
  const answer = secret.trim().toLowerCase();
  if (!guess || !answer) return false;
  if (guess === answer) return true;

  const escaped = answer.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (new RegExp(`\\b${escaped}\\b`, "i").test(message)) return true;

  const aliases = GUESS_ALIASES[answer] ?? [];
  return aliases.some(
    (alias) =>
      guess === alias.toLowerCase() ||
      message.toLowerCase().includes(alias.toLowerCase()),
  );
}
