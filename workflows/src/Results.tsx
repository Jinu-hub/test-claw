import { useAgent } from "agents/react";
import { useState } from "react";
import { initialQuizState, type QuizState } from "../worker/types";
import { RoomNav } from "./RoomNav";

/** Public results — only shows the finale after host approval. */
export function Results() {
  const [state, setState] = useState<QuizState>(initialQuizState());
  useAgent({
    agent: "QuizAgent",
    name: "quiz-room",
    query: { role: "results" },
    onStateUpdate: setState,
  });

  const ready = state.published && state.status === "published";

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900">
      <div className="mx-auto max-w-2xl space-y-4 px-4 py-10">
        <RoomNav current="results" />

        <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <h1 className="text-lg font-semibold tracking-tight">Quiz Results</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Public page — published only after the host approves the finale.
          </p>
        </section>

        {!ready ? (
          <section className="rounded-2xl border border-dashed border-zinc-300 bg-white p-6 shadow-sm">
            <p className="text-sm text-zinc-500">
              {state.status === "awaiting-publish"
                ? "Finale is ready. Waiting for the host to publish…"
                : "Results are not published yet. Check back after the quiz ends."}
            </p>
            <p className="mt-2 text-xs text-zinc-400">
              Current status: {state.status}
            </p>
          </section>
        ) : (
          <>
            <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
              <p className="text-xs font-medium uppercase tracking-wide text-zinc-400">
                {state.topic || "Quiz"}
              </p>
              <h2 className="mt-2 text-xl font-semibold tracking-tight">
                Winner: {state.winnerName}
              </h2>
              <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-zinc-700">
                {state.finaleText}
              </p>
            </section>

            <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
              <h2 className="text-sm font-semibold tracking-tight">
                Final leaderboard
              </h2>
              <ol className="mt-3 space-y-1 text-sm text-zinc-700">
                {state.leaderboard.length === 0 && (
                  <li className="text-zinc-400">No scores recorded.</li>
                )}
                {state.leaderboard.map((entry, i) => (
                  <li key={entry.name} className="flex justify-between gap-2">
                    <span>
                      {i + 1}. {entry.name}
                    </span>
                    <span className="font-mono text-xs text-zinc-500">
                      {entry.score} pts
                    </span>
                  </li>
                ))}
              </ol>
            </section>

            {state.roundHistory.length > 0 ? (
              <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
                <h2 className="text-sm font-semibold tracking-tight">
                  Round history
                </h2>
                <ul className="mt-3 space-y-3 text-sm">
                  {state.roundHistory.map((r) => (
                    <li
                      key={r.round}
                      className="rounded-md border border-zinc-100 bg-zinc-50 px-3 py-2"
                    >
                      <p className="font-medium">
                        Q{r.round}: {r.question}
                      </p>
                      <p className="mt-1 text-xs text-emerald-800">
                        Answer: {r.correctAnswer}
                      </p>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
