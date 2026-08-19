import type { TargetRow } from "./types";

export type SourceRole = "baseline" | "watch";
export type SourceRefresh = "never" | "daily";

export type SourceRef = {
  url: string;
  title: string;
  publisher: string;
  sourceType: string;
  /** Reality section keys this source may fill or patch. */
  sections: string[];
  role: SourceRole;
  refresh: SourceRefresh;
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

export const INSUFFICIENT_EVIDENCE_MARKER = "INSUFFICIENT_EVIDENCE";

export function insufficientEvidenceBody(
  sectionTitle: string,
  sectionKey: string
): string {
  return `${INSUFFICIENT_EVIDENCE_MARKER}

No bound evidence for section "${sectionTitle}" (${sectionKey}).
Do not infer from other sections or general knowledge.
status: insufficient_evidence`;
}

export function isInsufficientEvidenceBody(body: string): boolean {
  return body.trim().startsWith(INSUFFICIENT_EVIDENCE_MARKER);
}

export function sourceCoversSection(
  source: Pick<SourceRef, "sections">,
  sectionKey: string
): boolean {
  return source.sections.includes(sectionKey);
}

export function findSourceByUrl(
  sources: SourceRef[],
  url: string
): SourceRef | undefined {
  return sources.find((source) => source.url === url);
}

export function sourcesForScan(sources: SourceRef[]): SourceRef[] {
  return sources.filter(
    (source) => source.role === "watch" && source.refresh !== "never"
  );
}

function cfDoc(
  path: string,
  title: string,
  sections: string[]
): SourceRef {
  return {
    url: `https://developers.cloudflare.com/${path}`,
    title,
    publisher: "Cloudflare",
    sourceType: "official_docs",
    sections,
    role: "watch",
    refresh: "daily"
  };
}

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
    cfDoc("agents/", "Cloudflare Agents docs", ["architecture", "mcp"]),
    cfDoc("agents/api-reference/agents-api/", "Agents API", [
      "sdk",
      "durable-objects"
    ]),
    cfDoc("agents/api-reference/chat-agents/", "Chat agents", ["sdk"]),
    cfDoc("agents/api-reference/run-workflows/", "Run workflows", [
      "workflows"
    ]),
    cfDoc("agents/api-reference/browse-the-web/", "Browse the web", [
      "browser"
    ]),
    cfDoc("agents/api-reference/schedule-tasks/", "Schedule tasks", [
      "scheduling"
    ]),
    cfDoc("agents/api-reference/voice/", "Voice", ["voice"]),
    cfDoc("sandbox/", "Sandbox docs", ["sandbox"])
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
      sourceType: "regulator",
      sections: ["regulation", "etf"],
      role: "baseline",
      refresh: "never"
    },
    {
      url: "https://www.ishares.com/us/products/333011/ishares-bitcoin-trust",
      title: "iShares Bitcoin Trust ETF (IBIT)",
      publisher: "BlackRock iShares",
      sourceType: "issuer",
      sections: ["etf", "adoption"],
      role: "watch",
      refresh: "daily"
    },
    {
      url: "https://www.congress.gov/119/bills/hr3633/BILLS-119hr3633ih.xml",
      title: "CLARITY Act of 2025 (H.R.3633) bill text",
      publisher: "U.S. Congress",
      sourceType: "regulator",
      sections: ["regulation"],
      role: "watch",
      refresh: "daily"
    },
    {
      url: "https://bitcoincore.org/en/releases/28.0/",
      title: "Bitcoin Core 28.0 release notes",
      publisher: "Bitcoin Core",
      sourceType: "official_docs",
      sections: ["network"],
      role: "baseline",
      refresh: "never"
    },
    {
      url: "https://bitcoincore.org/en/releases/",
      title: "Bitcoin Core releases index",
      publisher: "Bitcoin Core",
      sourceType: "official_docs",
      sections: ["network"],
      role: "watch",
      refresh: "daily"
    },
    {
      url: "https://en.bitcoin.it/wiki/Controlled_supply",
      title: "Bitcoin Wiki: Controlled supply",
      publisher: "Bitcoin Wiki",
      sourceType: "reference",
      sections: ["supply"],
      role: "baseline",
      refresh: "never"
    },
    {
      url: "https://en.bitcoin.it/wiki/Mining",
      title: "Bitcoin Wiki: Mining",
      publisher: "Bitcoin Wiki",
      sourceType: "reference",
      sections: ["mining"],
      role: "baseline",
      refresh: "never"
    },
    {
      url: "https://developer.bitcoin.org/devguide/block_chain.html",
      title: "Bitcoin Developer Guide: Blockchain",
      publisher: "Bitcoin.org",
      sourceType: "official_docs",
      sections: ["onchain"],
      role: "baseline",
      refresh: "never"
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
        "Spot Bitcoin ETF approvals and product structure from bound sources — not daily fund flows"
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
        "Proof-of-work mining model and documented security assumptions — not live hashrate"
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
        "Blockchain structure concepts from bound docs — not live on-chain metrics"
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
