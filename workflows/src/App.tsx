import { Host } from "./Host";
import { Participant } from "./Participant";
import { Results } from "./Results";

export default function App() {
  if (location.pathname.startsWith("/host")) return <Host />;
  if (location.pathname.startsWith("/results")) return <Results />;
  return <Participant />;
}
