import { useAgentChat } from "@cloudflare/ai-chat/react";
import { useAgent } from "agents/react";
import { getToolName, isToolUIPart, type UIMessage } from "ai";
import { useState } from "react";
import { cartTotal, type OrderState } from "../worker/order";
import { handleClientToolCall } from "./client-tools";

function App() {
  const [orderState, setOrderState] = useState<OrderState>({ cart: [] });

  const agent = useAgent({
    agent: "FoodConciergeAgent",
    name: "default",
    onStateUpdate: (state) => setOrderState(state as OrderState),
  });

  const {
    messages,
    sendMessage,
    clearHistory,
    status,
    stop,
    addToolApprovalResponse,
  } = useAgentChat({
    agent,
    onToolCall: async ({ toolCall, addToolOutput }) => {
      handleClientToolCall({ toolCall, addToolOutput });
    },
  });

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
          const toolName = getToolName(part);
          const checkoutTotal = cartTotal(orderState.cart);

          return (
            <div
              key={i}
              className="text-sm bg-yellow-50 border border-yellow-300 p-2 rounded my-1"
            >
              <div>
                <strong>
                  {toolName === "placeOrder"
                    ? "주문을 확정할까요?"
                    : `Approve ${toolName}?`}
                </strong>
              </div>
              {toolName === "placeOrder" && checkoutTotal > 0 && (
                <p className="mt-2 text-base font-semibold text-zinc-900">
                  총액: {checkoutTotal.toLocaleString()}원
                </p>
              )}
              {toolName !== "placeOrder" &&
                "input" in part &&
                part.input != null && (
                  <pre className="mt-1">
                    {JSON.stringify(part.input, null, 2)}
                  </pre>
                )}
              {toolName === "placeOrder" && orderState.cart.length > 0 && (
                <ul className="mt-2 space-y-1 text-xs text-zinc-600">
                  {orderState.cart.map((line) => (
                    <li key={line.itemId}>
                      {line.name} × {line.quantity} —{" "}
                      {(line.price * line.quantity).toLocaleString()}원
                    </li>
                  ))}
                </ul>
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
            🍕 Food Concierge
          </h1>

          <form onSubmit={handleSubmit} className="flex flex-1 gap-2">
            <input
              name="input"
              placeholder="메뉴 주문, 배달 위치, 결제..."
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

      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-4 py-6 pb-24">
        <div className="flex-1 space-y-4">
          {messages.length === 0 && (
            <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 text-center text-sm text-zinc-400">
              <p className="font-medium text-zinc-600">🍕 Food Concierge</p>
              <div className="space-y-1">
                <p>Try: &quot;라지 페퍼로니 하나 주문할게요&quot;</p>
                <p>Then: &quot;내 위치로 보내줘&quot; → Approve checkout</p>
              </div>
              <p className="text-xs text-zinc-400">
                Card numbers in chat are stored as [REDACTED] after refresh.
              </p>
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
