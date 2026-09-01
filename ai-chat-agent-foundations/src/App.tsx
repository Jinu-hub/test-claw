import { useAgentChat } from "@cloudflare/ai-chat/react";
import { useAgent } from "agents/react";
import type { UIMessage } from "ai";
import { useEffect, useRef, useState } from "react";
import {
  CATEGORIES,
  CATEGORY_LABELS,
  toPublicGameView,
  type Category,
  type GameState,
  type PublicGameView,
} from "../worker/game";

const INITIAL_VIEW: PublicGameView = toPublicGameView({
  secret: "",
  solved: false,
  questionCount: 0,
  category: "animals",
});

function App() {
  const [gameView, setGameView] = useState<PublicGameView>(INITIAL_VIEW);
  const [nextCategory, setNextCategory] = useState<Category>("animals");
  const bottomRef = useRef<HTMLDivElement>(null);

  const agent = useAgent({
    agent: "TwentyQuestionsAgent",
    onStateUpdate: (state) => {
      setGameView(toPublicGameView(state as GameState));
    },
  });

  const { messages, sendMessage, clearHistory, status, stop } = useAgentChat({
    agent,
  });

  const isStreaming = status === "streaming" || status === "submitted";
  const gameActive = messages.length > 0 && !gameView.solved;
  const displayCategory =
    messages.length > 0 ? gameView.category : nextCategory;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isStreaming, gameView.solved]);

  const handleSubmit = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (gameView.solved || isStreaming) return;

    const formData = new FormData(e.currentTarget);
    const message = formData.get("input") as string;
    if (!message?.trim()) return;

    if (messages.length === 0) {
      await agent.stub.newGame(nextCategory);
    }

    sendMessage({ text: message });
    e.currentTarget.reset();
  };

  const handleNewGame = async () => {
    await agent.stub.newGame(nextCategory);
    clearHistory();
  };

  function renderMessage(msg: UIMessage) {
    return msg.parts.map((part, i) => {
      if (part.type === "text") {
        return (
          <p key={i} className="whitespace-pre-wrap leading-relaxed">
            {part.text}
          </p>
        );
      }
      if (part.type === "reasoning") {
        return null;
      }
      return null;
    });
  }

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50 text-zinc-900">
      <header className="sticky top-0 z-10 border-b border-zinc-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-2xl flex-col gap-3 px-4 py-4">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <h1 className="text-base font-semibold tracking-tight">
                🎯 20 Questions
              </h1>
              <p className="text-xs text-zinc-500">
                Ask yes/no questions and guess my secret identity.
              </p>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1 text-xs">
              <span
                className={`rounded-full px-2.5 py-1 font-medium ${
                  gameView.solved
                    ? "bg-emerald-100 text-emerald-700"
                    : "bg-blue-100 text-blue-700"
                }`}
              >
                {gameView.solved ? "You won!" : "In progress"}
              </span>
              <span className="text-zinc-500">
                Questions: {gameView.questionCount}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-zinc-500">Category</span>
            {CATEGORIES.map((category) => {
              const selected = nextCategory === category;
              return (
                <button
                  key={category}
                  type="button"
                  disabled={gameActive}
                  onClick={() => setNextCategory(category)}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                    selected
                      ? "bg-zinc-900 text-white"
                      : "border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-100"
                  } disabled:cursor-not-allowed disabled:opacity-50`}
                >
                  {CATEGORY_LABELS[category]}
                </button>
              );
            })}
            {gameActive && (
              <span className="text-[11px] text-zinc-400">
                Finish or start a new game to change category
              </span>
            )}
          </div>

          {gameView.solved && gameView.revealedAnswer && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
              <p className="font-medium">Correct!</p>
              <p className="mt-1">
                The answer was{" "}
                <strong className="font-semibold">{gameView.revealedAnswer}</strong>{" "}
                in {gameView.questionCount}{" "}
                {gameView.questionCount === 1 ? "question" : "questions"}.
              </p>
            </div>
          )}

          <div className="flex items-center gap-2">
            <form onSubmit={handleSubmit} className="flex min-w-0 flex-1 gap-2">
              <input
                name="input"
                placeholder={
                  gameView.solved
                    ? "Game over — start a new game"
                    : "Ask a yes/no question, or guess the answer..."
                }
                autoComplete="off"
                disabled={gameView.solved || isStreaming}
                className="min-w-0 flex-1 rounded-full border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm outline-none transition focus:border-zinc-400 focus:bg-white disabled:cursor-not-allowed disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={gameView.solved || isStreaming}
                className="shrink-0 rounded-full bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Send
              </button>
            </form>
            <button
              type="button"
              onClick={handleNewGame}
              disabled={isStreaming}
              className="shrink-0 rounded-full border border-zinc-200 bg-white px-3 py-2.5 text-xs font-medium text-zinc-900 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              New game
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-4 py-6">
        <div className="flex-1 space-y-4">
          {messages.length === 0 && (
            <div className="flex min-h-[45vh] flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-zinc-200 bg-white px-6 py-10 text-center">
              <div className="text-4xl">🤔</div>
              <div className="space-y-2">
                <p className="text-sm font-medium text-zinc-700">
                  Guess what I am!
                </p>
                <p className="text-xs text-zinc-500">
                  Category:{" "}
                  <span className="font-medium text-zinc-700">
                    {CATEGORY_LABELS[displayCategory]}
                  </span>
                </p>
              </div>
              <div className="max-w-sm space-y-1 text-xs text-zinc-400">
                <p>Try questions like:</p>
                <p>"Are you alive?" · "Are you bigger than a car?"</p>
                <p>When ready, guess the answer directly.</p>
              </div>
            </div>
          )}

          {messages.map((message) => {
            const isUser = message.role === "user";
            return (
              <div
                key={message.id}
                className={`flex ${isUser ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${
                    isUser
                      ? "bg-zinc-900 text-white"
                      : "border border-zinc-200 bg-white text-zinc-900"
                  }`}
                >
                  {renderMessage(message)}
                </div>
              </div>
            );
          })}

          {isStreaming && (
            <div className="flex justify-start">
              <div className="flex items-center gap-2 rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-500">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-zinc-400 opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-zinc-500" />
                </span>
                Thinking...
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      </main>

      <footer className="sticky bottom-0 border-t border-zinc-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-2 text-xs text-zinc-500">
          <span className="capitalize">
            Playing: {CATEGORY_LABELS[displayCategory]}
          </span>
          <div className="flex items-center gap-3">
            {isStreaming && (
              <button
                type="button"
                onClick={stop}
                className="text-red-500 transition hover:text-red-700"
              >
                Stop
              </button>
            )}
            <span
              className={
                status === "ready" ? "text-emerald-600" : "text-zinc-500"
              }
            >
              {status}
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default App;
