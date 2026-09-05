import { useAgentChat } from "@cloudflare/ai-chat/react";
import { useAgent } from "agents/react";
import { getToolName, isToolUIPart, type UIMessage } from "ai";
import type { BrowserAgent, BrowserAgentState } from "../worker/index";

type ToolOutput = {
  filename?: string;
  screenshotKey?: string;
  score?: number;
  hopCount?: number;
  maxHops?: number;
  hopsRemaining?: number;
  ok?: boolean;
  reason?: string;
  url?: string;
  title?: string;
  text?: string;
  links?: { text: string; href: string }[];
  checks?: { name: string; pass: boolean; value: string | null }[];
};

function evidenceSrc(key: string) {
  return `/${key}`;
}

function App() {
  const agent = useAgent<BrowserAgent, BrowserAgentState>({
    agent: "BrowserAgent",
  });

  const {
    messages,
    sendMessage,
    clearHistory,
    status,
    stop,
    addToolApprovalResponse,
  } = useAgentChat({ agent });

  const liveUrl = agent?.state?.liveUrl ?? null;
  const liveViewError = agent?.state?.liveViewError ?? null;
  const evidence = agent?.state?.evidence ?? [];
  const hopCount = agent?.state?.hopCount ?? 0;
  const explorationId = agent?.state?.explorationId ?? null;

  const handleClear = async () => {
    try {
      await agent.stub.clearSession();
    } catch (err) {
      console.error("clearSession failed", err);
    }
    clearHistory();
  };

  const handleSubmit = (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const message = formData.get("input") as string;
    if (!message?.trim()) return;
    sendMessage({ text: message });
    e.currentTarget.reset();
  };

  function renderMessage(msg: UIMessage) {
    return msg.parts.map((part, i) => {
      if (part.type === "text")
        return (
          <p key={i} className="whitespace-pre-wrap leading-relaxed">
            {part.text}
          </p>
        );
      if (part.type === "reasoning")
        return (
          <p key={i} className="text-xs italic text-zinc-500">
            {part.text}
          </p>
        );
      if (isToolUIPart(part)) {
        if ("approval" in part && part.state === "approval-requested") {
          return (
            <div
              key={i}
              className="my-1 rounded border border-yellow-300 bg-yellow-50 p-2 text-sm"
            >
              <div>
                <strong>Approve {getToolName(part)}?</strong>
              </div>
              {"input" in part && part.input != null && (
                <pre className="mt-1">
                  {JSON.stringify(part.input, null, 2)}
                </pre>
              )}
              <div className="mt-2 flex gap-2">
                <button
                  className="rounded bg-green-500 px-3 py-1 text-white"
                  onClick={() =>
                    addToolApprovalResponse({
                      id: part.approval.id,
                      approved: true,
                    })
                  }
                >
                  Approve
                </button>
                <button
                  className="rounded bg-red-500 px-3 py-1 text-white"
                  onClick={() =>
                    addToolApprovalResponse({
                      id: part.approval.id,
                      approved: false,
                    })
                  }
                >
                  Reject
                </button>
              </div>
            </div>
          );
        }

        if (part.state === "output-denied") {
          return (
            <div
              key={i}
              className="my-1 rounded border border-red-300 bg-red-50 p-2 text-sm"
            >
              <strong>{getToolName(part)}</strong> — Rejected
            </div>
          );
        }

        const name = getToolName(part);
        const output =
          part.state === "output-available"
            ? (part.output as ToolOutput | undefined)
            : undefined;

        const screenshotKey =
          name === "takeScreenshot" && output?.filename
            ? output.filename
            : name === "auditSeo" ||
                name === "followLink" ||
                name === "screenshot"
              ? (output?.screenshotKey ?? null)
              : null;

        const isSeoAudit = name === "auditSeo" && output?.checks;
        const isReadPage = name === "readPage" && output;

        return (
          <div
            key={i}
            className="mt-2 rounded-md border border-zinc-200 bg-zinc-50 p-2 text-xs"
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded bg-zinc-900 px-1.5 py-0.5 font-mono text-[10px] text-white">
                {name}
              </span>
              <span className="text-zinc-500">{part.state}</span>
              {typeof output?.hopCount === "number" && (
                <span className="rounded bg-zinc-200 px-1.5 py-0.5 text-[10px] text-zinc-700">
                  hop {output.hopCount}
                  {typeof output.maxHops === "number"
                    ? ` / ${output.maxHops}`
                    : ""}
                </span>
              )}
            </div>
            {"input" in part && part.input != null && (
              <pre className="mt-1 overflow-x-auto text-zinc-600">
                {JSON.stringify(part.input, null, 2)}
              </pre>
            )}
            {isSeoAudit && output ? (
              <div className="mt-2 space-y-1">
                <div className="text-sm font-bold">
                  SEO Score:{" "}
                  <span
                    className={
                      output.score! >= 87.5
                        ? "text-green-600"
                        : output.score! >= 50
                          ? "text-yellow-600"
                          : "text-red-600"
                    }
                  >
                    {output.score} / 100
                  </span>
                </div>
                <table className="w-full border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-zinc-200 text-left text-zinc-500">
                      <th className="py-1 pr-2">Check</th>
                      <th className="py-1 pr-2">Result</th>
                      <th className="py-1">Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {output.checks!.map((c) => (
                      <tr key={c.name} className="border-b border-zinc-100">
                        <td className="py-1 pr-2 font-mono">{c.name}</td>
                        <td className="py-1 pr-2">
                          {c.pass ? (
                            <span className="font-bold text-green-600">
                              ✓ Pass
                            </span>
                          ) : (
                            <span className="font-bold text-red-500">
                              ✗ Fail
                            </span>
                          )}
                        </td>
                        <td className="max-w-[200px] truncate py-1 text-zinc-500">
                          {c.value ?? "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : isReadPage ? (
              <div className="mt-2 space-y-1 text-zinc-700">
                <p>
                  <span className="font-medium">URL:</span> {output.url}
                </p>
                <p>
                  <span className="font-medium">Title:</span> {output.title}
                </p>
                <p>
                  <span className="font-medium">Links:</span>{" "}
                  {output.links?.length ?? 0}
                </p>
                {output.text && (
                  <pre className="mt-1 max-h-40 overflow-auto rounded border border-zinc-200 bg-white p-2 text-[11px] text-zinc-600">
                    {output.text.slice(0, 1200)}
                    {output.text.length > 1200 ? "…" : ""}
                  </pre>
                )}
              </div>
            ) : (
              part.state === "output-available" &&
              !screenshotKey && (
                <pre className="mt-1 overflow-x-auto text-zinc-600">
                  {JSON.stringify(part.output, null, 2)}
                </pre>
              )
            )}
            {output?.ok === false && output.reason && (
              <p className="mt-2 text-red-600">{output.reason}</p>
            )}
            {screenshotKey && (
              <img
                src={evidenceSrc(screenshotKey)}
                alt="screenshot"
                className="mt-2 w-full rounded border border-zinc-200"
              />
            )}
          </div>
        );
      }
      return null;
    });
  }

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50 text-zinc-900">
      <header className="sticky top-0 z-10 border-b border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <h1 className="shrink-0 text-sm font-semibold tracking-tight">
            🌐 Browser Agent
          </h1>

          <form onSubmit={handleSubmit} className="flex flex-1 gap-2">
            <input
              name="input"
              placeholder="Ask me to explore a site..."
              autoComplete="off"
              className="flex-1 rounded-full border border-zinc-200 bg-zinc-50 px-4 py-2 text-sm outline-none transition focus:border-zinc-400 focus:bg-white"
            />
            <button
              type="submit"
              className="rounded-full bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-700"
            >
              Send
            </button>
          </form>
          <button
            onClick={handleClear}
            className="shrink-0 rounded-md px-2 py-1 text-xs text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-900"
          >
            Clear
          </button>
          <button
            onClick={stop}
            className="shrink-0 rounded-md px-2 py-1 text-xs text-red-500 transition hover:bg-red-100 hover:text-red-900"
          >
            Stop
          </button>
          <span className="shrink-0 text-xs text-zinc-400">{status}</span>
        </div>
      </header>

      <div className="mx-auto grid w-full max-w-6xl flex-1 gap-4 px-4 py-4 lg:grid-cols-[1fr_340px]">
        <main className="flex min-w-0 flex-col pb-16">
          <div className="flex-1 space-y-4">
            {messages.length === 0 && (
              <div className="flex min-h-[40vh] items-center justify-center rounded-xl border border-dashed border-zinc-200 bg-white text-sm text-zinc-400">
                Ask something like “nomadcoders.co에서 가장 저렴한 강의를 찾아줘”
              </div>
            )}
            {messages.map((message: UIMessage) => {
              const isUser = message.role === "user";
              return (
                <div
                  key={message.id}
                  className={`flex ${isUser ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[90%] rounded-2xl px-4 py-2.5 text-sm ${
                      isUser
                        ? "bg-zinc-900 text-white"
                        : "border border-zinc-200 bg-white text-zinc-900"
                    }`}
                  >
                    {renderMessage(message)}
                  </div>
                </div>
              );
            })}
          </div>
        </main>

        <aside className="flex flex-col gap-4 lg:sticky lg:top-[57px] lg:self-start">
          <section className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
            <div className="flex items-center justify-between border-b border-zinc-100 px-3 py-2">
              <h2 className="text-xs font-semibold tracking-wide text-zinc-700">
                Live View
              </h2>
              <span className="text-[10px] text-zinc-400">
                {liveUrl ? "connected" : liveViewError ? "error" : "idle"}
              </span>
            </div>
            {liveUrl ? (
              <iframe
                title="Browser Live View"
                src={liveUrl}
                className="h-[280px] w-full bg-zinc-100"
              />
            ) : (
              <div className="flex min-h-[160px] flex-col items-center justify-center gap-2 px-4 py-6 text-center text-xs text-zinc-400">
                {liveViewError ? (
                  <>
                    <p className="font-medium text-amber-700">Live View unavailable</p>
                    <p className="max-w-xs text-amber-800/80">{liveViewError}</p>
                  </>
                ) : evidence.length > 0 ? (
                  <>
                    <p className="font-medium text-zinc-600">Session ended</p>
                    <p>
                      Browser closed after exploration. Replay the path in
                      Evidence below.
                    </p>
                  </>
                ) : (
                  <>
                    <p>Live View appears while the browser session is open.</p>
                    <p>Watch this panel during exploration (before closeBrowser).</p>
                  </>
                )}
              </div>
            )}
          </section>

          <section className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
            <div className="flex items-center justify-between gap-2 border-b border-zinc-100 px-3 py-2">
              <h2 className="text-xs font-semibold tracking-wide text-zinc-700">
                Evidence
              </h2>
              <span className="truncate text-[10px] text-zinc-400">
                hops {hopCount} · {evidence.length} shot
                {evidence.length === 1 ? "" : "s"}
                {explorationId
                  ? ` · ${explorationId.slice(0, 8)}…`
                  : ""}
              </span>
            </div>
            {evidence.length === 0 ? (
              <div className="px-3 py-8 text-center text-xs text-zinc-400">
                Screenshots from followLink / screenshot appear here in order.
              </div>
            ) : (
              <ol className="max-h-[420px] space-y-3 overflow-y-auto p-3">
                {evidence.map((key, index) => (
                  <li key={key} className="space-y-1">
                    <div className="flex items-center justify-between text-[10px] text-zinc-500">
                      <span className="font-medium text-zinc-700">
                        Step {index + 1}
                      </span>
                      <a
                        href={evidenceSrc(key)}
                        target="_blank"
                        rel="noreferrer"
                        className="truncate pl-2 text-zinc-400 hover:text-zinc-700"
                      >
                        {key}
                      </a>
                    </div>
                    <img
                      src={evidenceSrc(key)}
                      alt={`Evidence step ${index + 1}`}
                      className="w-full rounded border border-zinc-200"
                    />
                  </li>
                ))}
              </ol>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}

export default App;
