import { useEffect, useState } from "react";

/** Live seconds remaining until `closesAt` (ms epoch), or null if unavailable. */
export function useSecondsLeft(closesAt: number | null): number | null {
  const [left, setLeft] = useState<number | null>(() =>
    closesAt == null ? null : Math.max(0, Math.ceil((closesAt - Date.now()) / 1000)),
  );

  useEffect(() => {
    if (closesAt == null) {
      setLeft(null);
      return;
    }
    const tick = () =>
      setLeft(Math.max(0, Math.ceil((closesAt - Date.now()) / 1000)));
    tick();
    const id = window.setInterval(tick, 250);
    return () => window.clearInterval(id);
  }, [closesAt]);

  return left;
}
