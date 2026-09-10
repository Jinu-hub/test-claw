import { useAgent } from "agents/react";
import { useState } from "react";
import { initialQuizState, type QuizState } from "../worker/types";

/** Phase 1 shell — start / close / publish controls in Phase 2 & 7 */
export function Host() {
  const [state, setState] = useState<QuizState>(initialQuizState());
  const [topic, setTopic] = useState("Korean cinema");
  const agent = useAgent({
    agent: "QuizAgent",
    name: "quiz-room",
    query: { role: "host" },
    onStateUpdate: setState,
  });

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900">
      <div className="mx-auto max-w-2xl space-y-4 px-4 py-10">
        <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <h1 className="text-lg font-semibold tracking-tight">Quiz Host</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Start a 5-round quiz. Full controls land in later phases.
          </p>
          <div className="mt-4 flex gap-2">
            <input
              value={topic}
              onChange={(e) => setTopic(e.currentTarget.value)}
              placeholder="Quiz topic"
              aria-label="Quiz topic"
              className="flex-1 rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-sm outline-none transition focus:border-zinc-400"
            />
            <button
              type="button"
              onClick={() => agent.stub.startQuiz(topic)}
              className="inline-flex items-center gap-2 rounded-full bg-zinc-900 px-4 py-1.5 text-sm font-medium text-white transition hover:bg-zinc-700"
            >
              Start
            </button>
          </div>
          <p className="mt-4 text-sm text-zinc-600">
            Status: <span className="font-medium">{state.status}</span>
            {state.workflowId ? (
              <>
                {" "}
                · Workflow:{" "}
                <span className="font-mono text-xs">{state.workflowId}</span>
              </>
            ) : null}
          </p>
        </section>
      </div>
    </div>
  );
}
