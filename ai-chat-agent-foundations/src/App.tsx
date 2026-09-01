import { useAgentChat } from "@cloudflare/ai-chat/react";
import { useAgent } from "agents/react";
import type { UIMessage } from "ai";
import { useState } from "react";
import type { GameState } from "../worker/game";

const INITIAL_STATE: GameState = {
  secret: "",
  solved: false,
  questionCount: 0,
  category: "animals",
};

function App() {
  const [gameState, setGameState] = useState<GameState>(INITIAL_STATE);

  const agent = useAgent({
    agent: "TwentyQuestionsAgent",
    onStateUpdate: setGameState,
  });

  const { messages, sendMessage, clearHistory, status, stop } = useAgentChat({
    agent,
  });

  const handleSubmit = (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (gameState.solved) return;

    const formData = new FormData(e.currentTarget);
    const message = formData.get("input") as string;
    if (!message?.trim()) return;
    sendMessage({ text: message });
    e.currentTarget.reset();
  };

  const handleNewGame = async () => {
    await agent.stub.newGame();
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
      <header className="sticky top-0 z-10 border-b border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-2xl flex-col gap-2 px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <h1 className="shrink-0 text-sm font-semibold tracking-tight">
              🎯 20 Questions
            </h1>
            <div className="flex items-center gap-2 text-xs text-zinc-500">
              <span>Questions: {gameState.questionCount}</span>
              <span className="text-zinc-300">|</span>
              <span className="capitalize">Category: {gameState.category}</span>
            </div>
          </div>

          {gameState.solved && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-800">
              Correct! The answer was <strong>{gameState.secret}</strong>.
            </div>
          )}

          <div className="flex items-center gap-2">
            <form onSubmit={handleSubmit} className="flex flex-1 gap-2">
              <input
                name="input"
                placeholder={
                  gameState.solved
                    ? "Game over — start a new game"
                    : "Ask a yes/no question..."
                }
                autoComplete="off"
                disabled={gameState.solved}
                className="flex-1 rounded-full border border-zinc-200 bg-zinc-50 px-4 py-2 text-sm outline-none transition focus:border-zinc-400 focus:bg-white disabled:cursor-not-allowed disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={gameState.solved}
                className="rounded-full bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Send
              </button>
            </form>
            <button
              type="button"
              onClick={handleNewGame}
              className="shrink-0 rounded-full border border-zinc-200 bg-white px-3 py-2 text-xs font-medium text-zinc-900 transition hover:bg-zinc-100"
            >
              New game
            </button>
            <button
              onClick={stop}
              className="shrink-0 rounded-md px-2 py-1 text-xs text-red-500 transition hover:bg-red-100 hover:text-red-900"
            >
              Stop
            </button>
            {status}
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-4 py-6 pb-24">
        <div className="flex-1 space-y-4">
          {messages.length === 0 && (
            <div className="flex h-full min-h-[40vh] flex-col items-center justify-center gap-2 text-sm text-zinc-400">
              <p>Guess what I am!</p>
              <p className="text-xs capitalize">
                Category: {gameState.category}
              </p>
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
        </div>
      </main>
    </div>
  );
}

export default App;
