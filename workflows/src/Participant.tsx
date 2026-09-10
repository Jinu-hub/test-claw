import { useAgent } from "agents/react";
import { useEffect, useRef, useState } from "react";
import { initialQuizState, type QuizState } from "../worker/types";
import { RoomNav } from "./RoomNav";
import { useSecondsLeft } from "./useSecondsLeft";

const NAME_KEY = "quiz-player-name";

export function Participant() {
  const [state, setState] = useState<QuizState>(initialQuizState());
  const [nameInput, setNameInput] = useState("");
  const [joinedName, setJoinedName] = useState<string | null>(null);
  const [answer, setAnswer] = useState("");
  const [error, setError] = useState<string | null>(null);
  const autoJoined = useRef(false);
  const secondsLeft = useSecondsLeft(
    state.answerWindowOpen ? state.answerClosesAt : null,
  );

  const agent = useAgent({
    agent: "QuizAgent",
    name: "quiz-room",
    query: { role: "participant" },
    onStateUpdate: setState,
  });

  useEffect(() => {
    const saved = localStorage.getItem(NAME_KEY);
    if (saved) setNameInput(saved);
  }, []);

  // Re-bind connection identity after refresh / wrangler restart.
  useEffect(() => {
    if (autoJoined.current || !nameInput.trim()) return;
    autoJoined.current = true;
    void agent.stub
      .join(nameInput)
      .then((result: { name: string }) => {
        setJoinedName(result.name);
        localStorage.setItem(NAME_KEY, result.name);
      })
      .catch(() => {
        autoJoined.current = false;
      });
  }, [agent.stub, nameInput]);

  useEffect(() => {
    setAnswer("");
  }, [state.round]);

  const run = async (fn: () => Promise<unknown>) => {
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const onJoin = () =>
    run(async () => {
      const result = (await agent.stub.join(nameInput)) as {
        name: string;
      };
      setJoinedName(result.name);
      localStorage.setItem(NAME_KEY, result.name);
    });

  const onSubmit = () =>
    run(async () => {
      await agent.stub.submitAnswer(answer);
      setAnswer("");
    });

  const myAnswer = state.answers.find((a) => a.playerName === joinedName);

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900">
      <div className="mx-auto max-w-2xl space-y-4 px-4 py-10">
        <RoomNav current="play" />

        <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <h1 className="text-lg font-semibold tracking-tight">Quiz Show</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Join with a unique name. Questions sync live with every tab in{" "}
            <span className="font-mono text-xs">quiz-room</span>.
          </p>

          {!joinedName ? (
            <div className="mt-4 flex gap-2">
              <input
                value={nameInput}
                onChange={(e) => setNameInput(e.currentTarget.value)}
                placeholder="Your name"
                aria-label="Your name"
                className="flex-1 rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-sm outline-none transition focus:border-zinc-400"
              />
              <button
                type="button"
                onClick={onJoin}
                className="inline-flex items-center rounded-full bg-zinc-900 px-4 py-1.5 text-sm font-medium text-white transition hover:bg-zinc-700"
              >
                Join
              </button>
            </div>
          ) : (
            <p className="mt-4 text-sm text-zinc-600">
              Playing as <span className="font-medium">{joinedName}</span>
              <button
                type="button"
                className="ml-2 text-xs text-zinc-400 underline"
                onClick={() => {
                  setJoinedName(null);
                  autoJoined.current = false;
                  localStorage.removeItem(NAME_KEY);
                }}
              >
                change
              </button>
            </p>
          )}

          <p className="mt-3 text-sm text-zinc-600">
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
          </p>
          {error ? (
            <p className="mt-2 text-sm text-red-600">{error}</p>
          ) : null}
          {state.published ? (
            <p className="mt-2 text-sm text-emerald-700">
              Results published —{" "}
              <a href="/results" className="underline">
                view finale
              </a>
            </p>
          ) : null}
        </section>

        <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <h2 className="text-sm font-semibold tracking-tight">
            Participants ({state.participants.length})
          </h2>
          <ul className="mt-3 flex flex-wrap gap-2 text-sm">
            {state.participants.length === 0 && (
              <li className="text-zinc-400">Waiting for players…</li>
            )}
            {state.participants.map((p) => (
              <li
                key={p.name}
                className="rounded-full bg-zinc-100 px-3 py-1 text-zinc-700"
              >
                {p.name}
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <h2 className="text-sm font-semibold tracking-tight">
            {state.question
              ? `Q${state.round}: ${state.question}`
              : state.status === "generating"
                ? "Generating question…"
                : "Question"}
          </h2>
          {state.answerWindowOpen && secondsLeft != null ? (
            <p className="mt-1 text-sm font-medium text-emerald-700">
              {secondsLeft}s left
            </p>
          ) : null}
          {state.correctAnswer &&
          (state.status === "reveal" ||
            state.status === "awaiting-publish" ||
            state.status === "published") ? (
            <p className="mt-2 text-sm text-emerald-800">
              Answer: <span className="font-medium">{state.correctAnswer}</span>
            </p>
          ) : null}

          {state.answerWindowOpen && joinedName ? (
            <div className="mt-4 space-y-2">
              <textarea
                value={answer}
                onChange={(e) => setAnswer(e.currentTarget.value)}
                rows={3}
                placeholder="Your answer"
                aria-label="Your answer"
                className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-zinc-400"
              />
              <button
                type="button"
                onClick={onSubmit}
                className="inline-flex items-center rounded-full bg-zinc-900 px-4 py-1.5 text-sm font-medium text-white transition hover:bg-zinc-700"
              >
                Submit answer
              </button>
              {myAnswer ? (
                <p className="text-sm text-emerald-700">
                  Submitted: {myAnswer.text}
                </p>
              ) : null}
            </div>
          ) : (
            <p className="mt-3 text-sm text-zinc-400">
              {!joinedName
                ? "Join first to answer."
                : state.status === "generating"
                  ? "Host started the quiz — waiting for the LLM…"
                  : state.status === "grading"
                    ? "Grading this round…"
                    : state.status === "reveal"
                      ? "Round results are in — check the leaderboard."
                      : state.status === "awaiting-publish"
                        ? "Quiz finished — waiting for host to publish."
                        : "Waiting for the next question…"}
            </p>
          )}
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
      </div>
    </div>
  );
}
