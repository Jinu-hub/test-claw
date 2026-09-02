import type { UIMessage } from "ai";

export type Category = "celebrities" | "animals" | "countries";

export type GameState = {
  secret: string;
  solved: boolean;
  questionCount: number;
  category: Category;
};

/** Client-safe view — secret is only exposed after the game is solved. */
export type PublicGameView = {
  solved: boolean;
  questionCount: number;
  category: Category;
  revealedAnswer: string | null;
};

export function toPublicGameView(state: GameState): PublicGameView {
  return {
    solved: state.solved,
    questionCount: state.questionCount,
    category: state.category,
    revealedAnswer: state.solved ? state.secret : null,
  };
}

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
  return `You are secretly "${secret}" in a 20 Questions game. Category: ${category}.
Answer only the latest user message truthfully in character. Never reveal your name.
Reply in the user's language with one short phrase (yes/no or a brief hint).
If the user names a specific person, animal, or country, do not say yes unless they named you exactly.
Do not repeat syllables or characters. No reasoning.`;
}

export function buildWinSystemPrompt(secret: string): string {
  return `The user correctly guessed "${secret}". Congratulate them in one short sentence in their language.`;
}

export function buildWrongGuessSystemPrompt(guess: string): string {
  return `The user guessed "${guess}" but that is WRONG. You are not that identity.
Reply with only one word: "No." in English or "아니요." in Korean, matching the user's language.`;
}

/** True when the message looks like a direct name guess, not a yes/no question. */
export function isDirectGuess(message: string): boolean {
  const text = message.trim();
  if (!text || text.length > 80) return false;
  if (/[?？]$/.test(text)) return false;
  if (
    /^(are|is|am|was|were|do|does|did|can|could|have|has|had|will|would|should)\b/i.test(
      text,
    )
  ) {
    return false;
  }
  if (
    /(니요|나요|까요|을까|할까|지요|세요|어요|아요|습니까|인가요|맞아|맞나|있어|없어|뭐야|뭔가|누구|어디|언제|얼마|몇|커|작아)/.test(
      text,
    )
  ) {
    return false;
  }
  return true;
}

/** Keep recent turns only — full history slows inference on every message. */
export function trimMessagesForContext(
  messages: UIMessage[],
  maxMessages = 8,
): UIMessage[] {
  if (messages.length <= maxMessages) return messages;
  return messages.slice(-maxMessages);
}

/** Collapse doubled syllables from small models (e.g. "아아니니" → "아니"). */
export function sanitizeStutteredText(text: string): string {
  let result = text.trim();
  if (!result) return result;

  let prev: string;
  do {
    prev = result;
    result = result.replace(/([\uAC00-\uD7A3])\1+/g, "$1");
    result = result.replace(/([\uAC00-\uD7A3]{2})\1+/g, "$1");
    if (result.length % 2 === 0) {
      const half = result.slice(0, result.length / 2);
      if (result === half + half) result = half;
    }
  } while (result !== prev);

  return result;
}

const GUESS_ALIASES: Record<string, string[]> = {
  // animals
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
  // countries
  brazil: ["브라질"],
  canada: ["캐나다"],
  egypt: ["이집트"],
  france: ["프랑스"],
  germany: ["독일"],
  india: ["인도"],
  italy: ["이탈리아"],
  japan: ["일본"],
  kenya: ["케냐"],
  mexico: ["멕시코"],
  norway: ["노르웨이"],
  peru: ["페루"],
  "south korea": ["한국", "대한민국", "남한"],
  spain: ["스페인"],
  thailand: ["태국"],
  turkey: ["터키"],
  vietnam: ["베트남"],
  // celebrities
  "albert einstein": ["아인슈타인", "앨버트 아인슈타인"],
  "beyoncé": ["비욘세"],
  "charlie chaplin": ["찰리 채플린", "채플린"],
  "david bowie": ["데이비드 보위", "보위"],
  "elvis presley": ["엘비스", "엘비스 프레슬리"],
  "frida kahlo": ["프리다 칼로"],
  "greta thunberg": ["그레타 툰베리", "툰베리"],
  "hayao miyazaki": ["미야자키 하야오", "하야오 미야자키", "미야자키"],
  "indira gandhi": ["인디라 간디"],
  "jackie chan": ["성룡", "재키 찬", "잭키 찬"],
  "keanu reeves": ["키아누 리브스", "키아누"],
  "lady gaga": ["레이디 가가", "가가"],
  "michael jordan": ["마이클 조던", "조던"],
  "nelson mandela": ["넬슨 만델라", "만델라"],
  "oprah winfrey": ["오프라 윈프리", "오프라"],
  "pelé": ["펠레"],
  "queen elizabeth ii": [
    "엘리자베스 2세",
    "여왕 엘리자베스",
    "엘리자베스",
  ],
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
