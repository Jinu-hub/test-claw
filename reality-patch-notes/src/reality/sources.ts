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

const BITCOIN_PACK: SourcePack = {
  id: "bitcoin",
  match: (target) => {
    const name = target.name.toLowerCase();
    const id = target.id.toLowerCase();
    return (
      id === "target_bitcoin" ||
      id.startsWith("target_bitcoin_") ||
      name === "bitcoin" ||
      name === "btc" ||
      name.includes("bitcoin") ||
      name.includes("비트코인")
    );
  },
  sources: [
    {
      url: "https://www.sec.gov/newsroom/speeches-statements/gensler-statement-spot-bitcoin-011023",
      title: "SEC statement on spot Bitcoin ETP approval",
      publisher: "U.S. SEC",
      sourceType: "regulator"
    },
    {
      url: "https://www.ishares.com/us/products/333011/ishares-bitcoin-trust",
      title: "iShares Bitcoin Trust ETF (IBIT)",
      publisher: "BlackRock iShares",
      sourceType: "issuer"
    },
    {
      url: "https://www.congress.gov/119/bills/hr3633/BILLS-119hr3633ih.xml",
      title: "CLARITY Act of 2025 (H.R.3633) bill text",
      publisher: "U.S. Congress",
      sourceType: "regulator"
    },
    {
      url: "https://bitcoincore.org/en/releases/28.0/",
      title: "Bitcoin Core 28.0 release notes",
      publisher: "Bitcoin Core",
      sourceType: "official_docs"
    },
    {
      url: "https://en.bitcoin.it/wiki/Controlled_supply",
      title: "Bitcoin Wiki: Controlled supply",
      publisher: "Bitcoin Wiki",
      sourceType: "reference"
    },
    {
      url: "https://en.bitcoin.it/wiki/Mining",
      title: "Bitcoin Wiki: Mining",
      publisher: "Bitcoin Wiki",
      sourceType: "reference"
    },
    {
      url: "https://developer.bitcoin.org/devguide/block_chain.html",
      title: "Bitcoin Developer Guide: Blockchain",
      publisher: "Bitcoin.org",
      sourceType: "official_docs"
    }
  ],
  sections: [
    {
      key: "regulation",
      title: "Regulation",
      purpose:
        "Legal status, CLARITY Act and related bills, and durable regulatory rulings — not rumor"
    },
    {
      key: "etf",
      title: "ETF and Fund Flows",
      purpose:
        "Spot Bitcoin ETF approvals, products, and structural fund-flow facts — not daily price"
    },
    {
      key: "network",
      title: "Network Upgrades",
      purpose:
        "Bitcoin Core releases, consensus/soft-fork changes, and protocol upgrades"
    },
    {
      key: "mining",
      title: "Mining and Security",
      purpose:
        "Proof-of-work mining model, hash-rate/security facts, and documented attack assumptions"
    },
    {
      key: "adoption",
      title: "Institutional Adoption",
      purpose:
        "Durable institutional custody, ETF, and corporate/treasury adoption — not celebrity hype"
    },
    {
      key: "supply",
      title: "Halving and Supply",
      purpose:
        "Issuance schedule, halvings, and supply cap as protocol facts"
    },
    {
      key: "onchain",
      title: "On-chain Metrics",
      purpose:
        "Blockchain structure and documented on-chain measurement concepts — not short-term price"
    }
  ]
};

const SOURCE_PACKS: SourcePack[] = [CLOUDFLARE_AGENTS_PACK, BITCOIN_PACK];

export function getSourcePack(target: TargetRow): SourcePack | null {
  return SOURCE_PACKS.find((pack) => pack.match(target)) ?? null;
}

export function listSupportedSourcePackIds(): string[] {
  return SOURCE_PACKS.map((pack) => pack.id);
}

export function noSourcePackMessage(targetName: string): string {
  const supported = listSupportedSourcePackIds().join(", ");
  return `No canonical source pack for "${targetName}". Supported packs: ${supported}.`;
}
