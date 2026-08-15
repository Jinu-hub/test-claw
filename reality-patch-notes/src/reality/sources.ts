import type { TargetRow } from "./types";

export type SourceRef = {
  url: string;
  title: string;
  publisher: string;
  sourceType: string;
};

export type SectionBlueprint = {
  key: string;
  title: string;
  purpose: string;
};

export type SourcePack = {
  id: string;
  match: (target: TargetRow) => boolean;
  sources: SourceRef[];
  sections: SectionBlueprint[];
};

const CLOUDFLARE_AGENTS_PACK: SourcePack = {
  id: "cloudflare-agents",
  match: (target) => {
    const name = target.name.toLowerCase();
    const id = target.id.toLowerCase();
    return (
      id === "target_cf_agents" ||
      id.includes("cloudflare-agents") ||
      id.includes("cf-agents") ||
      name.includes("cloudflare agents")
    );
  },
  sources: [
    {
      url: "https://developers.cloudflare.com/agents/",
      title: "Cloudflare Agents docs",
      publisher: "Cloudflare",
      sourceType: "official_docs"
    },
    {
      url: "https://developers.cloudflare.com/agents/api-reference/agents-api/",
      title: "Agents API",
      publisher: "Cloudflare",
      sourceType: "official_docs"
    },
    {
      url: "https://developers.cloudflare.com/agents/api-reference/chat-agents/",
      title: "Chat agents",
      publisher: "Cloudflare",
      sourceType: "official_docs"
    },
    {
      url: "https://developers.cloudflare.com/agents/api-reference/run-workflows/",
      title: "Run workflows",
      publisher: "Cloudflare",
      sourceType: "official_docs"
    },
    {
      url: "https://developers.cloudflare.com/agents/api-reference/browse-the-web/",
      title: "Browse the web",
      publisher: "Cloudflare",
      sourceType: "official_docs"
    },
    {
      url: "https://developers.cloudflare.com/agents/api-reference/schedule-tasks/",
      title: "Schedule tasks",
      publisher: "Cloudflare",
      sourceType: "official_docs"
    },
    {
      url: "https://developers.cloudflare.com/agents/api-reference/voice/",
      title: "Voice",
      publisher: "Cloudflare",
      sourceType: "official_docs"
    },
    {
      url: "https://developers.cloudflare.com/sandbox/",
      title: "Sandbox docs",
      publisher: "Cloudflare",
      sourceType: "official_docs"
    }
  ],
  sections: [
    {
      key: "architecture",
      title: "Core Architecture",
      purpose: "Agent execution model, Durable Objects, state, and hibernation"
    },
    {
      key: "sdk",
      title: "Agents SDK",
      purpose: "SDK classes, callable RPC, client hooks, and tool patterns"
    },
    {
      key: "durable-objects",
      title: "Durable Objects",
      purpose: "Per-instance storage, SQL, scheduling, and persistence"
    },
    {
      key: "browser",
      title: "Browser",
      purpose: "Browser automation / CDP browsing capabilities"
    },
    {
      key: "sandbox",
      title: "Sandbox",
      purpose: "Isolated code execution and related limits if documented"
    },
    {
      key: "mcp",
      title: "MCP",
      purpose: "MCP client/server integration with agents"
    },
    {
      key: "workflows",
      title: "Workflows",
      purpose: "Durable multi-step workflows and when to use them"
    },
    {
      key: "scheduling",
      title: "Scheduling",
      purpose: "schedule, scheduleEvery, cron, and delayed agent tasks"
    },
    {
      key: "voice",
      title: "Voice",
      purpose: "Experimental STT/TTS voice capabilities for agents"
    }
  ]
};

const SOURCE_PACKS: SourcePack[] = [CLOUDFLARE_AGENTS_PACK];

export function getSourcePack(target: TargetRow): SourcePack | null {
  return SOURCE_PACKS.find((pack) => pack.match(target)) ?? null;
}

export function listSupportedSourcePackIds(): string[] {
  return SOURCE_PACKS.map((pack) => pack.id);
}
