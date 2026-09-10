import { useAgent } from "agents/react";
import { useState } from "react";
import { initialQuizState, type QuizState } from "../worker/types";
import { useSecondsLeft } from "./useSecondsLeft";

export function Host() {
  const [state, setState] = useState<QuizState>(initialQuizState());
  const [topic, setTopic] = useState("Korean cinema");
  const [error, setError] = useState<string | null>(null);
  const secondsLeft = useSecondsLeft(
    state.answerWindowOpen ? state.answerClosesAt : null,
  );
  const agent = useAgent({
    agent: "QuizAgent",
    name: "quiz-room",
    query: { role: "host" },
    onStateUpdate: setState,
  });

  const canStart =
    state.status === "lobby" ||
    state.status === "done" ||
    state.status === "published";

  const run = async (fn: () => Promise<unknown>) => {
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900">
      <div className="mx-auto max-w-2xl space-y-4 px-4 py-10">
        <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <h1 className="text-lg font-semibold tracking-tight">Quiz Host</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Start the workflow to generate questions. Players see each round at
            the same time.
          </p>

          <div className="mt-4 flex flex-wrap gap-2">
            <input
              value={topic}
              onChange={(e) => setTopic(e.currentTarget.value)}
              placeholder="Quiz topic"
              aria-label="Quiz topic"
              className="min-w-48 flex-1 rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-sm outline-none transition focus:border-zinc-400"
            />
            <button
              type="button"
              disabled={!canStart}
              onClick={() => run(() => agent.stub.startQuiz(topic))}
              className="inline-flex items-center rounded-full bg-zinc-900 px-4 py-1.5 text-sm font-medium text-white transition hover:bg-zinc-700 disabled:opacity-40"
            >
              Start
            </button>
            <button
              type="button"
              disabled={!state.answerWindowOpen}
              onClick={() =>
                run(() => agent.stub.closeRound(state.round || 1))
              }
              className="inline-flex items-center rounded-full border border-zinc-300 bg-white px-4 py-1.5 text-sm font-medium transition hover:bg-zinc-100 disabled:opacity-40"
            >
              Close round early
            </button>
            <button
              type="button"
              disabled={state.status !== "awaiting-publish"}
              onClick={() => run(() => agent.stub.publishResults())}
              className="inline-flex items-center rounded-full border border-zinc-300 bg-white px-4 py-1.5 text-sm font-medium transition hover:bg-zinc-100 disabled:opacity-40"
            >
              Approve &amp; publish
            </button>
            <button
              type="button"
              onClick={() => run(() => agent.stub.resetRoom())}
              className="inline-flex items-center rounded-full border border-red-200 bg-white px-4 py-1.5 text-sm font-medium text-red-700 transition hover:bg-red-50"
            >
              Reset
            </button>
          </div>

          <p className="mt-4 text-sm text-zinc-600">
            Status: <span className="font-medium">{state.status}</span>
            {state.topic ? (
              <>
                {" "}
                · Topic: <span className="font-medium">{state.topic}</span>
              </>
            ) : null}
            {state.round > 0 ? (
              <>
                {" "}
                · Round {state.round}/{state.totalRounds}
              </>
            ) : null}
            {state.answerWindowOpen ? (
              <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">
                answers open
                {secondsLeft != null ? ` · ${secondsLeft}s` : ""}
              </span>
            ) : null}
          </p>
          {error ? (
            <p className="mt-2 text-sm text-red-600">{error}</p>
          ) : null}
          {state.status === "awaiting-publish" ? (
            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              <p className="font-medium">Finale ready — approve to publish</p>
              {state.winnerName ? (
                <p className="mt-1">Winner: {state.winnerName}</p>
              ) : null}
              {state.finaleText ? (
                <p className="mt-1 whitespace-pre-wrap text-amber-800/90">
                  {state.finaleText}
                </p>
              ) : null}
              <a
                href="/results"
                className="mt-2 inline-block text-xs font-medium underline"
              >
                Open /results
              </a>
            </div>
          ) : null}
          {state.published ? (
            <p className="mt-3 text-sm text-emerald-700">
              Published.{" "}
              <a href="/results" className="underline">
                View public results
              </a>
            </p>
          ) : null}
        </section>

        <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <h2 className="text-sm font-semibold tracking-tight">
            {state.question
              ? `Q${state.round}: ${state.question}`
              : state.status === "generating"
                ? "Generating question…"
                : state.status === "grading"
                  ? "Grading…"
                  : "Question"}
          </h2>
          {state.correctAnswer &&
          (state.status === "reveal" || state.status === "done") ? (
            <p className="mt-2 text-sm text-emerald-800">
              Answer: <span className="font-medium">{state.correctAnswer}</span>
            </p>
          ) : null}
          <p className="mt-2 text-sm text-zinc-500">
            {state.status === "generating"
              ? "LLM is writing the next question (retries on failure)."
              : state.status === "grading"
                ? "LLM is scoring free-text answers (near matches count)."
                : state.status === "reveal"
                  ? "Round results revealed — leaderboard updated."
                  : state.answerWindowOpen
                    ? "Broadcast to all connected clients."
                    : "Waiting for the next round."}
          </p>
        </section>

        <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <h2 className="text-sm font-semibold tracking-tight">Leaderboard</h2>
          <ol className="mt-3 space-y-1 text-sm text-zinc-700">
            {state.leaderboard.length === 0 && (
              <li className="text-zinc-400">No scores yet.</li>
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

        <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <h2 className="text-sm font-semibold tracking-tight">
            Participants ({state.participants.length})
          </h2>
          <ul className="mt-3 space-y-1 text-sm text-zinc-700">
            {state.participants.length === 0 && (
              <li className="text-zinc-400">No one has joined yet.</li>
            )}
            {state.participants.map((p) => (
              <li key={p.name} className="flex justify-between gap-2">
                <span>{p.name}</span>
                <span className="font-mono text-xs text-zinc-400">
                  {state.scores[p.name] ?? 0} pts
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <h2 className="text-sm font-semibold tracking-tight">
            Answers this round ({state.answers.length})
          </h2>
          <ul className="mt-3 space-y-2 text-sm">
            {state.answers.length === 0 && (
              <li className="text-zinc-400">No answers yet.</li>
            )}
            {state.answers.map((a) => {
              const grade = state.roundHistory
                .find((r) => r.round === state.round)
                ?.grades.find((g) => g.playerName === a.playerName);
              return (
                <li
                  key={a.playerName}
                  className="rounded-md border border-zinc-100 bg-zinc-50 px-3 py-2"
                >
                  <div className="flex justify-between gap-2">
                    <span className="font-medium">{a.playerName}</span>
                    {grade ? (
                      <span
                        className={`text-xs font-medium ${
                          grade.points > 0
                            ? "text-emerald-700"
                            : "text-zinc-400"
                        }`}
                      >
                        {grade.points > 0 ? `+${grade.points}` : "0"}
                      </span>
                    ) : null}
                  </div>
                  <span className="mt-0.5 block text-zinc-600">{a.text}</span>
                  {grade?.reason ? (
                    <span className="mt-1 block text-xs text-zinc-400">
                      {grade.reason}
                    </span>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </section>
      </div>
    </div>
  );
}
