import { useAgentChat } from "@cloudflare/ai-chat/react";
import { useAgent } from "agents/react";
import { getToolName, isToolUIPart, type UIMessage } from "ai";
import { useState } from "react";
import type { ChatAgent, McpState } from "../worker/index";

function App() {
  const [url, setUrl] = useState("");
  const [mcp, setMcp] = useState<McpState>({
    servers: {},
    tools: [],
    prompts: [],
    resources: [],
  });

  const agent = useAgent<ChatAgent>({
    agent: "ChatAgent",
    onMcpUpdate: setMcp,
  });

  const {
    messages,
    sendMessage,
    clearHistory,
    status,
    stop,
    addToolApprovalResponse,
  } = useAgentChat({ agent });

  const handleSubmit = (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const message = formData.get("input") as string;
    if (!message?.trim()) return;
    sendMessage({ text: message });
    e.currentTarget.reset();
  };

  const handleAddServer = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!url.trim()) return;
    let name = url;
    try {
      name = new URL(url).hostname;
    } catch {
      console.log("error");
    }
    await agent.stub.addServer(name, url);
    setUrl("");
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
            🔌 MCP Client
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

      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 px-4 py-6 pb-24">
        <section className="rounded-2xl border border-zinc-200 bg-white p-4">
          <form onSubmit={handleAddServer} className="flex gap-2">
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com/mcp"
              className="flex-1 rounded-full border border-zinc-200 bg-zinc-50 px-4 py-2 text-sm outline-none transition focus:border-zinc-400 focus:bg-white"
            />
            <button
              type="submit"
              className="rounded-full bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-700"
            >
              Add MCP
            </button>
          </form>
        </section>

        <section className="rounded-2xl border border-zinc-200 bg-white p-4">
          <h2 className="text-sm font-semibold tracking-tight">MCP Servers</h2>
          {Object.entries(mcp.servers).length === 0 && (
            <p className="mt-2 text-sm text-zinc-400">No servers connected.</p>
          )}
          {Object.entries(mcp.servers).map(([id, server]) => (
            <div
              key={id}
              className="mt-2 flex items-start justify-between gap-2 rounded-md border border-zinc-200 bg-zinc-50 p-2 text-sm"
            >
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{server.name}</p>
                <p className="truncate text-xs text-zinc-500">
                  {server.server_url}
                </p>
                <p className="text-xs">
                  state: <span className="font-mono">{server.state}</span>
                </p>
                {server.error && (
                  <p className="text-xs text-red-600">{server.error}</p>
                )}
                {server.auth_url && server.state === "authenticating" && (
                  <a
                    className="text-xs text-blue-600 underline"
                    href={server.auth_url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Authorize
                  </a>
                )}
              </div>
              <button
                onClick={() => agent.stub.removeServer(id)}
                className="rounded-md px-2 py-1 text-xs text-red-600 transition hover:bg-red-50"
              >
                Remove
              </button>
            </div>
          ))}

          <h3 className="mt-4 text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Tools ({mcp.tools.length})
          </h3>
          <ul className="mt-2 space-y-1">
            {mcp.tools.map((t) => (
              <li key={`${t.serverId}-${t.name}`} className="text-xs">
                <span className="font-mono">{t.name}</span>
                {t.description && (
                  <span className="text-zinc-500"> — {t.description}</span>
                )}
              </li>
            ))}
          </ul>
        </section>

        <div className="flex-1 space-y-4">
          {messages.length === 0 && (
            <div className="flex h-full min-h-[40vh] items-center justify-center text-sm text-zinc-400">
              Add an MCP server, then ask the agent to use its tools.
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