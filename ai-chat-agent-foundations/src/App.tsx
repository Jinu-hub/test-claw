import { useAgentChat } from "@cloudflare/ai-chat/react";
import { useAgent } from "agents/react";

function App() {
  const agent = useAgent({ agent: "PotatoChatAgent" });
  const { messages, sendMessage, clearHistory } = useAgentChat({ agent });

  const handleSubmit = (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const message = formData.get("input") as string;
    sendMessage({ text: message });
    e.currentTarget.reset();
  };

  return (
    <div>
      <ul>
        {messages.map((message: any) => (
          <li key={message.id}>
            <strong>{message.role}:</strong>
            {message.parts.map((part: any, index: number) =>
              part.type === "text" ? (
                <span key={index}>{part.text}</span>
              ) : null,
            )}
          </li>
        ))}
      </ul>
      <form onSubmit={handleSubmit}>
        <input name="input" placeholder="Type a message..." />
        <button type="submit">Send</button>
      </form>
      <button onClick={clearHistory}>Clear History</button>
    </div>
  );
}

export default App;