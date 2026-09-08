import { useAgentChat } from "@cloudflare/ai-chat/react";
import { useAgent } from "agents/react";
import { getToolName, isToolUIPart, type UIMessage } from "ai";
import { useRef, useState } from "react";

function App() {
  const [ingesting, setIngesting] = useState<string | null>(null);
  const [checkpointResult, setCheckpointResult] = useState<string | null>(
    null,
  );
  const [checkpointBusy, setCheckpointBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const agent = useAgent({ agent: "RAGAgent" });

  const runPhase4Checkpoint = async () => {
    setCheckpointBusy(true);
    setCheckpointResult(null);
    try {
      const sources = await agent.call("listSources", []);
      setCheckpointResult(
        JSON.stringify(
          {
            sourceCount: Array.isArray(sources) ? sources.length : 0,
            sources,
            chatHint:
              'Ask in chat: "내가 저장한 게 뭐가 있지?" — agent should call listSources and list all.',
          },
          null,
          2,
        ),
      );
    } catch (err) {
      setCheckpointResult(
        err instanceof Error ? err.message : "Phase 4 checkpoint failed",
      );
    } finally {
      setCheckpointBusy(false);
    }
  };

  const {
    messages,
    sendMessage,
    clearHistory,
    status,
    stop,
    addToolApprovalResponse,
  } = useAgentChat({ agent });

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIngesting(file.name);
    const fd = new FormData();
    fd.append("file", file);
    await fetch("/api/upload", { method: "POST", body: fd });
    setIngesting(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
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
              className="text-sm bg-yellow-50 border border-yellow-300 p-2 rounded my-1"
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
                  className="px-3 py-1 bg-green-500 text-white rounded"
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
                  className="px-3 py-1 bg-red-500 text-white rounded"
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
              className="text-sm bg-red-50 border border-red-300 p-2 rounded my-1"
            >
              <strong>{getToolName(part)}</strong> — Rejected
            </div>
          );
        }

        return (
          <div
            key={i}
            className="mt-2 rounded-md border border-zinc-200 bg-zinc-50 p-2 text-xs"
          >
            <div className="flex items-center gap-2">
              <span className="rounded bg-zinc-900 px-1.5 py-0.5 font-mono text-[10px] text-white">
                {getToolName(part)}
              </span>
              <span className="text-zinc-500">{part.state}</span>
            </div>
            {"input" in part && part.input != null && (
              <pre className="mt-1 overflow-x-auto text-zinc-600">
                {JSON.stringify(part.input, null, 2)}
              </pre>
            )}
            {part.state === "output-available" && (
              <pre className="mt-1 overflow-x-auto text-zinc-600">
                {JSON.stringify(part.output, null, 2)}
              </pre>
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
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3 px-4 py-3">
          <h1 className="shrink-0 text-sm font-semibold tracking-tight">
            📚 RAG Agent
          </h1>

          <form onSubmit={handleSubmit} className="flex flex-1 gap-2">
            <input
              name="input"
              placeholder="Type a message..."
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
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf"
            onChange={handleFileChange}
            disabled={ingesting !== null}
            className="block w-44 shrink-0 text-xs text-zinc-600 file:mr-2 file:rounded-full file:border-0 file:bg-zinc-900 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-white hover:file:bg-zinc-700 disabled:opacity-50"
          />
          {ingesting && (
            <span className="shrink-0 text-xs text-zinc-500">
              Ingesting {ingesting}…
            </span>
          )}
          <button
            onClick={clearHistory}
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

      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-4 py-6 pb-24">
        <div className="flex-1 space-y-4">
          <div className="mb-4 rounded-lg border border-dashed border-zinc-300 bg-white p-3 text-xs text-zinc-600">
            <div className="mb-2 font-medium text-zinc-800">
              Phase 4 checkpoint — listSources
            </div>
            <p className="mb-2 text-zinc-500">
              Button dumps saved sources. Then ask in chat:{" "}
              <code>내가 저장한 게 뭐가 있지?</code> — expect title + URL +
              saved time for each source.
            </p>
            <button
              type="button"
              disabled={checkpointBusy}
              onClick={runPhase4Checkpoint}
              className="rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
            >
              {checkpointBusy ? "Listing…" : "List sources"}
            </button>
            {checkpointResult && (
              <pre className="mt-2 max-h-48 overflow-auto rounded bg-zinc-50 p-2 text-[11px] text-zinc-700">
                {checkpointResult}
              </pre>
            )}
          </div>
          {messages.length === 0 && (
            <div className="flex h-full min-h-[40vh] items-center justify-center text-sm text-zinc-400">
              Say something to get started.
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
                  className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${
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
    </div>
  );
}

export default App;
