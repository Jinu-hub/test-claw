import { useAgentChat } from "@cloudflare/ai-chat/react";
import { useAgent } from "agents/react";
import type { UIMessage } from "ai";
import { useState } from "react";
import type { DebateCase } from "../shared/schemas";
import type { Orchestrator, OrchestratorState } from "../worker/index";

const SUGGESTED_TOPICS = [
  "민초, 찬성인가 반대인가?",
  "탕수육 부먹 대 찍먹?",
  "깻잎논쟁?",
] as const;

function messageText(msg: UIMessage): string {
  return msg.parts
    .filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text)
    .join("");
}

function statusLabel(status: string, running: boolean): string {
  if (!running) return "토론 시작";
  switch (status) {
    case "extracting":
      return "입장 추출 중…";
    case "debating":
      return "대변인 준비 중…";
    case "judging":
      return "심판 판정 중…";
    default:
      return "진행 중…";
  }
}

function CaseCard({
  label,
  stance,
  debateCase,
  activity,
  running,
}: {
  label: string;
  stance?: string;
  debateCase?: DebateCase;
  activity?: string;
  running: boolean;
}) {
  const argCount = debateCase?.arguments.length ?? 0;
  const argsOk = argCount === 3;
  const busy = running && !debateCase;

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold">{label}</h2>
          {stance && (
            <p className="mt-0.5 text-xs text-zinc-500">{stance}</p>
          )}
        </div>
        {busy && (
          <span className="relative mt-1 inline-flex h-2 w-2 shrink-0 rounded-full bg-amber-500">
            <span className="absolute inset-0 animate-ping rounded-full bg-amber-500 opacity-75" />
          </span>
        )}
      </div>
      <p className="mt-2 text-xs text-zinc-500">
        {activity ?? (busy ? "시작 대기…" : "대기")}
      </p>

      {debateCase && (
        <div className="mt-3 space-y-2 border-t border-zinc-100 pt-3">
          <div className="flex items-center justify-between">
            <p className="text-xs uppercase tracking-wide text-zinc-400">
              주장
            </p>
            <span
              className={`text-xs font-medium ${
                argsOk ? "text-emerald-600" : "text-red-600"
              }`}
            >
              논거 {argCount}/3
            </span>
          </div>
          <p className="text-sm">
            <span className="font-medium">모두발언 · </span>
            {debateCase.opening}
          </p>
          <ol className="list-decimal space-y-1.5 pl-5 text-sm">
            {debateCase.arguments.map((arg, i) => (
              <li key={i}>
                <span className="font-medium">{arg.point}</span>
                <span className="text-zinc-600"> — {arg.reasoning}</span>
              </li>
            ))}
          </ol>
          <p className="text-sm">
            <span className="font-medium">마무리 · </span>
            {debateCase.closing}
          </p>
        </div>
      )}
    </section>
  );
}

function App() {
  const [topic, setTopic] = useState<string>(SUGGESTED_TOPICS[0]);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  const agent = useAgent<Orchestrator, OrchestratorState>({
    agent: "Orchestrator",
    defaultCallTimeout: 0,
  });

  const { messages, clearHistory, status: chatStatus } = useAgentChat({
    agent,
  });

  const status = agent.state?.status ?? "idle";
  const sides = agent.state?.sides;
  const activity = agent.state?.activity ?? {};
  const caseA = agent.state?.cases?.sideA;
  const caseB = agent.state?.cases?.sideB;
  const bothReady = Boolean(caseA && caseB);

  const lastAssistant = [...messages]
    .reverse()
    .find((m) => m.role === "assistant");
  const verdictText = lastAssistant ? messageText(lastAssistant) : "";
  const decisivePoints = [caseA, caseB]
    .flatMap((c) => c?.arguments.map((a) => a.point) ?? [])
    .filter(Boolean);
  const mentionsWinner =
    Boolean(sides) &&
    (verdictText.includes(sides!.sideA.name) ||
      verdictText.includes(sides!.sideB.name)) &&
    (verdictText.includes("승자") || verdictText.includes("승리"));
  const mentionsArgument = decisivePoints.some((p) =>
    verdictText.includes(p),
  );
  const e2eOk =
    bothReady &&
    caseA!.arguments.length === 3 &&
    caseB!.arguments.length === 3 &&
    Boolean(verdictText) &&
    mentionsWinner &&
    mentionsArgument;

  const runDebate = async () => {
    setError(null);
    setRunning(true);
    try {
      await clearHistory();
      await agent.call("debate", [topic], { timeout: 0 });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50 text-zinc-900">
      <header className="sticky top-0 z-10 border-b border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-3xl flex-col gap-2 px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <h1 className="shrink-0 text-sm font-semibold tracking-tight">
              Debate Arena
            </h1>
            <span className="shrink-0 text-xs text-zinc-400">
              {status}
              {chatStatus !== "ready" ? ` · ${chatStatus}` : ""}
            </span>
          </div>
          <div className="flex gap-2">
            <input
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !running && topic.trim()) {
                  void runDebate();
                }
              }}
              placeholder="토론 주제를 입력하세요"
              className="flex-1 rounded-full border border-zinc-200 bg-zinc-50 px-4 py-2 text-sm outline-none transition focus:border-zinc-400 focus:bg-white"
            />
            <button
              type="button"
              disabled={running || !topic.trim()}
              onClick={runDebate}
              className="shrink-0 rounded-full bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-700 disabled:opacity-40"
            >
              {statusLabel(status, running)}
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {SUGGESTED_TOPICS.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                disabled={running}
                onClick={() => setTopic(suggestion)}
                className={`rounded-full border px-3 py-1 text-xs transition ${
                  topic === suggestion
                    ? "border-zinc-900 bg-zinc-900 text-white"
                    : "border-zinc-200 bg-white text-zinc-600 hover:border-zinc-400"
                }`}
              >
                {suggestion}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 px-4 py-6">
        <section className="rounded-2xl border border-zinc-200 bg-white p-4">
          <p className="text-sm text-zinc-600">
            주제를 넣으면 부모가 양쪽 입장을 추출하고, 분리된 대변인 서브
            에이전트 두 명이 동시에 주장을 준비한 뒤, 심판이 판정을
            스트리밍합니다.
          </p>
          {status === "extracting" && (
            <p className="mt-2 text-xs text-amber-700">양쪽 입장 추출 중…</p>
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
            stance={sides?.sideA.stance}
            debateCase={caseA}
            activity={activity["advocate-sideA"]}
            running={running && (status === "debating" || status === "extracting")}
          />
          <CaseCard
            label={sides?.sideB.name ?? "Side B"}
            stance={sides?.sideB.stance}
            debateCase={caseB}
            activity={activity["advocate-sideB"]}
            running={running && (status === "debating" || status === "extracting")}
          />
        </div>

        <section className="rounded-2xl border border-zinc-200 bg-white p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            심판 판정
          </p>
          <div className="mt-3 space-y-3">
            {messages.length === 0 && (
              <p className="text-sm text-zinc-400">
                {running && status === "judging"
                  ? "판정 스트리밍 중…"
                  : "양쪽 주장이 모이면 여기에 판정이 나타납니다."}
              </p>
            )}
            {messages.map((message) => {
              const isUser = message.role === "user";
              return (
                <div
                  key={message.id}
                  className={`flex ${isUser ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[90%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap ${
                      isUser
                        ? "bg-zinc-900 text-white"
                        : "border border-amber-200 bg-amber-50 text-zinc-900"
                    }`}
                  >
                    {!isUser && (
                      <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-amber-700">
                        Judge
                      </p>
                    )}
                    {messageText(message) || "…"}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {bothReady && verdictText && (
          <section
            className={`rounded-2xl border p-4 ${
              e2eOk
                ? "border-emerald-200 bg-emerald-50"
                : "border-amber-200 bg-amber-50"
            }`}
          >
            <p className="text-xs font-medium uppercase tracking-wide">
              E2E checklist
            </p>
            <pre className="mt-2 whitespace-pre-wrap text-sm">
              {[
                `양쪽 입장 추출: ${sides ? "PASS" : "FAIL"}`,
                `양쪽 activity: ${activity["advocate-sideA"] && activity["advocate-sideB"] ? "PASS" : "FAIL"}`,
                `논거 3개씩: ${caseA?.arguments.length === 3 && caseB?.arguments.length === 3 ? "PASS" : "FAIL"}`,
                `판정 승자: ${mentionsWinner ? "PASS" : "FAIL"}`,
                `결정적 논거: ${mentionsArgument ? "PASS" : "FAIL"}`,
                e2eOk
                  ? "→ Phase 5 E2E OK (부먹/찍먹도 한 번 더 확인)"
                  : "→ 판정·논거를 확인하세요",
              ].join("\n")}
            </pre>
          </section>
        )}
      </main>
    </div>
  );
}

export default App;
