const LINKS = [
  { href: "/", label: "Play" },
  { href: "/host", label: "Host" },
  { href: "/results", label: "Results" },
] as const;

export function RoomNav({ current }: { current: "play" | "host" | "results" }) {
  return (
    <nav className="flex flex-wrap items-center gap-2 text-sm">
      {LINKS.map((link) => {
        const active =
          (current === "play" && link.href === "/") ||
          (current === "host" && link.href === "/host") ||
          (current === "results" && link.href === "/results");
        return (
          <a
            key={link.href}
            href={link.href}
            className={
              active
                ? "rounded-full bg-zinc-900 px-3 py-1 font-medium text-white"
                : "rounded-full border border-zinc-200 bg-white px-3 py-1 text-zinc-600 transition hover:bg-zinc-100"
            }
          >
            {link.label}
          </a>
        );
      })}
      <span className="ml-auto font-mono text-xs text-zinc-400">quiz-room</span>
    </nav>
  );
}
