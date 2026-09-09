import { useAgent } from "agents/react";
import { useState } from "react";
import type { DebateCase } from "../shared/schemas";
import type { Orchestrator, OrchestratorState } from "../worker/index";

function CaseCard({
  label,
  debateCase,
  activity,
  running,
}: {
  label: string;
  debateCase?: DebateCase;
  activity?: string;
  running: boolean;
}) {
  const argCount = debateCase?.arguments.length ?? 0;
  const argsOk = argCount === 3;

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">{label}</h2>
        {running && !debateCase && (
          <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-500">
            <span className="absolute inset-0 animate-ping rounded-full bg-amber-500 opacity-75" />
          </span>
        )}
      </div>
      <p className="mt-1 text-xs text-zinc-500">
        {activity ?? (running ? "시작 대기…" : "대기")}
      </p>

      {debateCase && (
        <>
          <div className="mt-3 flex items-center justify-between">
            <p className="text-xs uppercase tracking-wide text-zinc-400">
              Case
            </p>
            <span
              className={`text-xs font-medium ${
                argsOk ? "text-emerald-600" : "text-red-600"
              }`}
            >
              논거 {argCount}/3 {argsOk ? "✓" : "✗"}
            </span>
          </div>
          <p className="mt-2 text-sm">
            <span className="font-medium">Opening: </span>
            {debateCase.opening}
          </p>
          <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-sm">
            {debateCase.arguments.map((arg, i) => (
              <li key={i}>
                <span className="font-medium">{arg.point}</span>
                <span className="text-zinc-600"> — {arg.reasoning}</span>
              </li>
            ))}
          </ol>
          <p className="mt-2 text-sm">
            <span className="font-medium">Closing: </span>
            {debateCase.closing}
          </p>
        </>
      )}
    </section>
  );
}

function App() {
  const [topic, setTopic] = useState<string>("민초, 찬성인가 반대인가?");
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  const agent = useAgent<Orchestrator, OrchestratorState>({
    agent: "Orchestrator",
    // LLM + parallel sub-agents exceed the 30s default RPC timeout.
    defaultCallTimeout: 0,
  });

  const status = agent.state?.status ?? "idle";
  const sides = agent.state?.sides;
  const activity = agent.state?.activity ?? {};
  const caseA = agent.state?.cases?.sideA;
  const caseB = agent.state?.cases?.sideB;

  const runDebate = async () => {
    setError(null);
    setRunning(true);
    try {
      await agent.call("debate", [topic], { timeout: 0 });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  };

  const bothReady = Boolean(caseA && caseB);
  const argsOk =
    caseA?.arguments.length === 3 && caseB?.arguments.length === 3;
  const activityBoth =
    Boolean(activity["advocate-sideA"]) &&
    Boolean(activity["advocate-sideB"]);

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50 text-zinc-900">
      <header className="sticky top-0 z-10 border-b border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
          <h1 className="shrink-0 text-sm font-semibold tracking-tight">
            Debate Arena
          </h1>
          <input
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="민초, 찬성인가 반대인가? / 탕수육 부먹 대 찍먹?"
            className="flex-1 rounded-full border border-zinc-200 bg-zinc-50 px-4 py-2 text-sm outline-none transition focus:border-zinc-400 focus:bg-white"
          />
          <button
            type="button"
            disabled={running || !topic.trim()}
            onClick={runDebate}
            className="shrink-0 rounded-full bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-700 disabled:opacity-40"
          >
            {running
              ? status === "extracting"
                ? "Extracting…"
                : "Debating…"
              : "Debate"}
          </button>
          <span className="shrink-0 text-xs text-zinc-400">{status}</span>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 px-4 py-6">
        <section className="rounded-2xl border border-zinc-200 bg-white p-4">
          <p className="text-xs uppercase tracking-wide text-zinc-400">
            Phase 3 — extract stances + Promise.all
          </p>
          <p className="mt-1 text-sm text-zinc-600">
            주제에서 양쪽 입장을 추출한 뒤 대변인 두 명을 동시에 실행합니다.
            서로 상대 주장을 보지 못하며, activity가 동시에 갱신되어야 합니다.
          </p>
          {sides && (
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm">
                <p className="font-medium">{sides.sideA.name}</p>
                <p className="text-xs text-zinc-500">{sides.sideA.stance}</p>
              </div>
              <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm">
                <p className="font-medium">{sides.sideB.name}</p>
                <p className="text-xs text-zinc-500">{sides.sideB.stance}</p>
              </div>
            </div>
          )}
        </section>

        {error && (
          <section className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            {error}
          </section>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <CaseCard
            label={sides?.sideA.name ?? "Side A"}
            debateCase={caseA}
            activity={activity["advocate-sideA"]}
            running={running && status === "debating"}
          />
          <CaseCard
            label={sides?.sideB.name ?? "Side B"}
            debateCase={caseB}
            activity={activity["advocate-sideB"]}
            running={running && status === "debating"}
          />
        </div>

        {bothReady && (
          <section
            className={`rounded-2xl border p-4 ${
              argsOk && activityBoth
                ? "border-emerald-200 bg-emerald-50"
                : "border-red-200 bg-red-50"
            }`}
          >
            <p className="text-xs font-medium uppercase tracking-wide">
              Phase 3 checkpoint
            </p>
            <pre className="mt-2 whitespace-pre-wrap text-sm">
              {[
                `입장 추출: ${sides ? "PASS" : "FAIL"}`,
                `양쪽 activity: ${activityBoth ? "PASS" : "FAIL"}`,
                `Side A 논거 3개: ${caseA?.arguments.length === 3 ? "PASS" : "FAIL"}`,
                `Side B 논거 3개: ${caseB?.arguments.length === 3 ? "PASS" : "FAIL"}`,
                argsOk && activityBoth && sides
                  ? "→ Phase 3 체크포인트 OK"
                  : "→ Phase 3 체크포인트 FAIL",
              ].join("\n")}
            </pre>
          </section>
        )}

        {!bothReady && !running && (
          <div className="flex min-h-[16vh] items-center justify-center text-sm text-zinc-400">
            Debate를 눌러 Phase 3 체크포인트를 확인하세요.
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
