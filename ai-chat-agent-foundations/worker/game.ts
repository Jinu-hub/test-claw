export type Category = "celebrities" | "animals" | "countries";

export type GameState = {
  secret: string;
  solved: boolean;
  questionCount: number;
  category: Category;
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

export function createInitialState(category: Category = CATEGORY): GameState {
  return {
    secret: pickSecret(category),
    solved: false,
    questionCount: 0,
    category,
  };
}
