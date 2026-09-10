import { Host } from "./Host";
import { Participant } from "./Participant";

export default function App() {
  if (location.pathname.startsWith("/host")) return <Host />;
  if (location.pathname.startsWith("/results")) {
    return (
      <div className="min-h-screen bg-zinc-50 px-4 py-10 text-zinc-900">
        <div className="mx-auto max-w-2xl rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <h1 className="text-lg font-semibold">Results</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Public results page — wired in Phase 6.
          </p>
        </div>
      </div>
    );
  }
  return <Participant />;
}
