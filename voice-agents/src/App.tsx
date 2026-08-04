import { useVoiceAgent } from "@cloudflare/voice/react";
import { useAgent } from "agents/react";

function App() {
  const agent = useAgent({ agent: "VoiceAgent" });
  const {
    startCall,
    endCall,
    status,
    toggleMute,
    isMuted,
    interimTranscript,
    transcript,
  } = useVoiceAgent({
    agent: "VoiceAgent",
  });
  return (
    <div>
      <h1>Talk to Agent</h1>
      <hr />
      <h3>{status}</h3>
      <hr />
      <h2>interim: {interimTranscript}</h2>
      <hr />
      transcript:
      <ul>
        {transcript.map((message) => (
          <li key={message.timestamp}>
            <strong>{message.role}</strong>: {message.text}
          </li>
        ))}
      </ul>
      <hr />
      <button onClick={status === "idle" ? startCall : endCall}>
        {status === "idle" ? "click to talk" : "click to hang up"}
      </button>
      <br />
      <button onClick={toggleMute}>{isMuted ? "unmute" : "mute"}</button>
    </div>
  );
}

export default App;