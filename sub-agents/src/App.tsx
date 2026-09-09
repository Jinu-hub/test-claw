import { useAgent } from "agents/react";
import { useState } from "react";
import { ArgumentSchema } from "../shared/schemas";
import type { Orchestrator, OrchestratorState } from "../worker/index";

function App() {
  const [topic, setTopic] = useState<string | null>(null);
  const [schemaCheck, setSchemaCheck] = useState<string | null>(null);

  const agent = useAgent<Orchestrator, OrchestratorState>({
    agent: "Orchestrator",
  });

  const status = agent.state?.status ?? "idle";

  const handleSubmit = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const formData = new FormData(form);
    const message = formData.get("input") as string;
    if (!message?.trim()) return;
    form.reset();
    setTopic(message);
    // Phase 3: agent.stub.debate(message)
    setSchemaCheck(
      "Phase 1: debate()는 아직 미구현입니다. 스키마 체크 버튼을 사용하세요.",
    );
  };

  /** Phase 1 checkpoint: verify ArgumentSchema rejects wrong argument counts. */
  const runSchemaCheckpoint = () => {
    const base = {
      stance: "민초단",
      opening: "민트초코는 훌륭하다.",
      closing: "이상이다.",
    };
    const good = {
      ...base,
      arguments: [
        { point: "상쾌함", reasoning: "초콜릿에 민트가 더해져 상쾌하다." },
        { point: "취향 다양성", reasoning: "취향은 존중되어야 한다." },
        { point: "대중성", reasoning: "전 세계적으로 사랑받는 조합이다." },
      ],
    };
    const tooFew = {
      ...base,
      arguments: good.arguments.slice(0, 2),
    };
    const tooMany = {
      ...base,
      arguments: [
        ...good.arguments,
        { point: "extra", reasoning: "should fail" },
      ],
    };

    const ok = ArgumentSchema.safeParse(good).success;
    const reject2 = !ArgumentSchema.safeParse(tooFew).success;
    const reject4 = !ArgumentSchema.safeParse(tooMany).success;

    setSchemaCheck(
      [
        `3개 논거 허용: ${ok ? "PASS" : "FAIL"}`,
        `2개 논거 거부: ${reject2 ? "PASS" : "FAIL"}`,
        `4개 논거 거부: ${reject4 ? "PASS" : "FAIL"}`,
        ok && reject2 && reject4
          ? "→ Phase 1 체크포인트 OK"
          : "→ Phase 1 체크포인트 FAIL",
      ].join("\n"),
    );
  };

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50 text-zinc-900">
      <header className="sticky top-0 z-10 border-b border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3 px-4 py-3">
          <h1 className="shrink-0 text-sm font-semibold tracking-tight">
            Debate Arena
          </h1>

          <form onSubmit={handleSubmit} className="flex flex-1 gap-2">
            <input
              name="input"
              placeholder="민초, 찬성인가 반대인가?"
              autoComplete="off"
              className="flex-1 rounded-full border border-zinc-200 bg-zinc-50 px-4 py-2 text-sm outline-none transition focus:border-zinc-400 focus:bg-white"
            />
            <button
              type="submit"
              className="rounded-full bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-700"
            >
              Debate
            </button>
          </form>
          <button
            type="button"
            onClick={runSchemaCheckpoint}
            className="shrink-0 rounded-md px-2 py-1 text-xs text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-900"
          >
            Schema check
          </button>
          <span className="shrink-0 text-xs text-zinc-400">{status}</span>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 px-4 py-6">
        {topic && (
          <section className="rounded-2xl border border-zinc-200 bg-white p-4">
            <p className="text-xs uppercase tracking-wide text-zinc-400">
              Topic
            </p>
            <p className="mt-1 text-sm font-medium text-zinc-900">{topic}</p>
            <p className="mt-3 text-xs text-zinc-500">
              Status: {status} (Phase 1 — orchestration deferred)
            </p>
          </section>
        )}

        {schemaCheck && (
          <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-emerald-700">
              Phase 1 checkpoint
            </p>
            <pre className="mt-2 whitespace-pre-wrap text-sm text-emerald-900">
              {schemaCheck}
            </pre>
          </section>
        )}

        <div className="flex min-h-[30vh] items-center justify-center text-sm text-zinc-400">
          Phase 1: 스키마·타입·상태. Schema check로 체크포인트를 확인하세요.
        </div>
      </main>
    </div>
  );
}

export default App;
