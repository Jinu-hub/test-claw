import { useVoiceAgent, type VoiceRole } from "@cloudflare/voice/react";
import { useAgent } from "agents/react";
import { useState } from "react";

function App() {
  const [_history, setHistory] = useState<
    {
      role: VoiceRole;
      content: string;
    }[]
  >([]);
  const agent = useAgent({
    agent: "VoiceAgent",
    onOpen: async () => {
      const history = await agent.stub.getHistory();
      setHistory(history);
    },
  });
  const {
    startCall,
    endCall,
    status,
    toggleMute,
    isMuted,
    interimTranscript,
    transcript,
    sendText,
    audioLevel,
  } = useVoiceAgent({
    agent: "VoiceAgent",
  });

  const isIdle = status === "idle";

  console.log(audioLevel);

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900">
      <div className="mx-auto max-w-xl px-4 py-10">
        <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <h1 className="text-lg font-semibold tracking-tight">
              Talk to Agent
            </h1>
            <span className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-600 capitalize">
              {status}
            </span>
          </div>

          <div className="mt-4 min-h-50 space-y-1 rounded-xl border border-zinc-100 bg-zinc-50 p-4">
            {/*{history.map((message, index) => (
              <div key={index} className="flex items-center gap-2 text-sm">
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    message.role === "user"
                      ? "bg-blue-100 text-blue-700"
                      : "bg-green-100 text-green-700"
                  }`}
                >
                  {message.role}
                </span>
                <span>{message.content}</span>
              </div>
            ))}*/}
            {transcript.map((message) => (
              <div
                key={message.timestamp}
                className="flex items-center gap-2 text-sm"
              >
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    message.role === "user"
                      ? "bg-blue-100 text-blue-700"
                      : "bg-green-100 text-green-700"
                  }`}
                >
                  {message.role}
                </span>
                <span>{message.text}</span>
              </div>
            ))}
            {transcript.length === 0 && (
              <p className="text-sm text-zinc-400">No messages yet.</p>
            )}
            {interimTranscript && (
              <p className="pt-2 text-sm italic text-zinc-500">
                {interimTranscript}
              </p>
            )}
          </div>

          <div className="mt-4 flex items-center gap-2">
            <button
              onClick={isIdle ? startCall : endCall}
              className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium text-white transition ${
                isIdle
                  ? "bg-zinc-900 hover:bg-zinc-700"
                  : "bg-red-600 hover:bg-red-500"
              }`}
            >
              {isIdle ? "Click to talk" : "Click to hang up"}
            </button>

            <button
              onClick={toggleMute}
              className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-900 transition hover:bg-zinc-100"
            >
              {isMuted ? "Unmute" : "Mute"}
            </button>
          </div>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const formData = new FormData(e.currentTarget);
            const text = formData.get("input") as string;
            sendText(text);
            e.currentTarget.reset();
          }}
          className="mt-4 flex gap-2"
        >
          <input
            name="input"
            placeholder="Type a message (no STT)..."
            autoComplete="off"
            className="flex-1 rounded-full border border-zinc-200 bg-zinc-50 px-4 py-2 text-sm outline-none transition focus:border-zinc-400 focus:bg-white"
          />
          <button
            type="submit"
            aria-label="Send"
            className="rounded-full bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-700"
          >
            Send
          </button>
        </form>
      </div>
    </div>
  );
}

export default App;