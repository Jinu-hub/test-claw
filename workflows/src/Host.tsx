import { useAgent } from "agents/react";
import { useState } from "react";
import { initialQuizState, type QuizState } from "../worker/types";

export function Host() {
  const [state, setState] = useState<QuizState>(initialQuizState());
  const [topic, setTopic] = useState("Korean cinema");
  const [error, setError] = useState<string | null>(null);
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
            Manage the room: start a quiz, open/close the answer window, publish
            results.
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
              onClick={() => run(() => agent.stub.openAnswers(1, 60))}
              className="inline-flex items-center rounded-full border border-zinc-300 bg-white px-4 py-1.5 text-sm font-medium transition hover:bg-zinc-100"
            >
              Open answers
            </button>
            <button
              type="button"
              onClick={() =>
                run(() => agent.stub.closeRound(state.round || 1))
              }
              className="inline-flex items-center rounded-full border border-zinc-300 bg-white px-4 py-1.5 text-sm font-medium transition hover:bg-zinc-100"
            >
              Close round
            </button>
            <button
              type="button"
              onClick={() => run(() => agent.stub.publishResults())}
              className="inline-flex items-center rounded-full border border-zinc-300 bg-white px-4 py-1.5 text-sm font-medium transition hover:bg-zinc-100"
            >
              Publish
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
            {state.answerWindowOpen ? (
              <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">
                answers open
              </span>
            ) : null}
          </p>
          {error ? (
            <p className="mt-2 text-sm text-red-600">{error}</p>
          ) : null}
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
            {state.answers.map((a) => (
              <li
                key={a.playerName}
                className="rounded-md border border-zinc-100 bg-zinc-50 px-3 py-2"
              >
                <span className="font-medium">{a.playerName}</span>
                <span className="mt-0.5 block text-zinc-600">{a.text}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
