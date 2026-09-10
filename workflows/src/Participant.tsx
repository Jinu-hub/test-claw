import { useAgent } from "agents/react";
import { useState } from "react";
import { initialQuizState, type QuizState } from "../worker/types";

/** Phase 1 shell — join / answer UI in Phase 2 & 7 */
export function Participant() {
  const [state, setState] = useState<QuizState>(initialQuizState());
  useAgent({
    agent: "QuizAgent",
    name: "quiz-room",
    query: { role: "participant" },
    onStateUpdate: setState,
  });

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900">
      <div className="mx-auto max-w-2xl space-y-4 px-4 py-10">
        <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <h1 className="text-lg font-semibold tracking-tight">Quiz Show</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Participant view (Phase 1 scaffold). Join &amp; answer land in Phase
            2.
          </p>
          <p className="mt-4 text-sm text-zinc-600">
            Status: <span className="font-medium">{state.status}</span>
            {state.topic ? (
              <>
                {" "}
                · Topic: <span className="font-medium">{state.topic}</span>
              </>
            ) : null}
          </p>
        </section>
      </div>
    </div>
  );
}
