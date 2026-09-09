import { useAgent } from "agents/react";
import { useState } from "react";
import type { DebateCase } from "../shared/schemas";
import type { Orchestrator, OrchestratorState } from "../worker/index";

function App() {
  const [topic, setTopic] = useState<string>(
    "민초, 찬성인가 반대인가?",
  );
  const [error, setError] = useState<string | null>(null);
  const [lastCase, setLastCase] = useState<DebateCase | null>(null);
  const [running, setRunning] = useState(false);

  const agent = useAgent<Orchestrator, OrchestratorState>({
    agent: "Orchestrator",
    // LLM + sub-agent work exceeds the 30s default RPC timeout.
    defaultCallTimeout: 0,
  });

  const status = agent.state?.status ?? "idle";
  const activity = agent.state?.activity ?? {};
  const sideAName = agent.state?.sides?.sideA.name ?? "advocate-sideA";
  const sideAActivity = activity["advocate-sideA"];
  const sideACase = agent.state?.cases?.sideA ?? lastCase;

  const runDebugAdvocate = async () => {
    setError(null);
    setLastCase(null);
    setRunning(true);
    try {
      const result = await agent.call("debugAdvocate", [topic], {
        timeout: 0,
      });
      setLastCase(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  };

  const argCount = sideACase?.arguments.length ?? 0;
  const checkpointOk = argCount === 3;

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50 text-zinc-900">
      <header className="sticky top-0 z-10 border-b border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3 px-4 py-3">
          <h1 className="shrink-0 text-sm font-semibold tracking-tight">
            Debate Arena
          </h1>
          <input
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="민초, 찬성인가 반대인가?"
            className="flex-1 rounded-full border border-zinc-200 bg-zinc-50 px-4 py-2 text-sm outline-none transition focus:border-zinc-400 focus:bg-white"
          />
          <button
            type="button"
            disabled={running || !topic.trim()}
            onClick={runDebugAdvocate}
            className="shrink-0 rounded-full bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-700 disabled:opacity-40"
          >
            {running ? "Running…" : "Debug Advocate"}
          </button>
          <span className="shrink-0 text-xs text-zinc-400">{status}</span>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 px-4 py-6">
        <section className="rounded-2xl border border-zinc-200 bg-white p-4">
          <p className="text-xs uppercase tracking-wide text-zinc-400">
            Phase 2 — single advocate
          </p>
          <p className="mt-1 text-sm text-zinc-600">
            Debug Advocate로 민초단만 실행합니다. RpcTarget activity가 단계별로
            갱신되고, 논거가 정확히 3개인지 확인하세요.
          </p>

          <div className="mt-4 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium">{sideAName}</span>
              {running && (
                <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-500">
                  <span className="absolute inset-0 animate-ping rounded-full bg-amber-500 opacity-75" />
                </span>
              )}
            </div>
            <p className="mt-1 text-xs text-zinc-500">
              {sideAActivity ?? (running ? "시작 대기…" : "대기")}
            </p>
          </div>
        </section>

        {error && (
          <section className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            {error}
          </section>
        )}

        {sideACase && (
          <section className="rounded-2xl border border-zinc-200 bg-white p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                Case — {sideACase.stance}
              </p>
              <span
                className={`text-xs font-medium ${
                  checkpointOk ? "text-emerald-600" : "text-red-600"
                }`}
              >
                논거 {argCount}/3 {checkpointOk ? "✓" : "✗"}
              </span>
            </div>
            <p className="mt-3 text-sm text-zinc-800">
              <span className="font-medium">Opening: </span>
              {sideACase.opening}
            </p>
            <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm">
              {sideACase.arguments.map((arg, i) => (
                <li key={i}>
                  <span className="font-medium">{arg.point}</span>
                  <span className="text-zinc-600"> — {arg.reasoning}</span>
                </li>
              ))}
            </ol>
            <p className="mt-3 text-sm text-zinc-800">
              <span className="font-medium">Closing: </span>
              {sideACase.closing}
            </p>
          </section>
        )}

        {sideACase && (
          <section
            className={`rounded-2xl border p-4 ${
              checkpointOk
                ? "border-emerald-200 bg-emerald-50"
                : "border-red-200 bg-red-50"
            }`}
          >
            <p className="text-xs font-medium uppercase tracking-wide">
              Phase 2 checkpoint
            </p>
            <pre className="mt-2 whitespace-pre-wrap text-sm">
              {[
                `activity 수신: ${sideAActivity ? "PASS" : "FAIL"}`,
                `논거 정확히 3개: ${checkpointOk ? "PASS" : "FAIL"}`,
                checkpointOk
                  ? "→ Phase 2 체크포인트 OK"
                  : "→ Phase 2 체크포인트 FAIL",
              ].join("\n")}
            </pre>
          </section>
        )}

        {!sideACase && !running && (
          <div className="flex min-h-[20vh] items-center justify-center text-sm text-zinc-400">
            Debug Advocate를 눌러 Phase 2 체크포인트를 확인하세요.
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
