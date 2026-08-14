import { ensureRealitySchema, type SqlExecutor } from "./schema";
import {
  getCurrentContextMarkdown,
  getTarget,
  putCurrentContext,
  upsertTarget,
  type RealityStore
} from "./store";
import type { RealityContext } from "./types";

export const FIXTURE_TARGET_ID = "target_cf_agents";

export function createCloudflareAgentsFixture(
  now = new Date().toISOString()
): RealityContext {
  return {
    targetId: FIXTURE_TARGET_ID,
    name: "Cloudflare Agents",
    profile: {
      description:
        "Stateful AI agents on Cloudflare Workers using Durable Objects, scheduling, and chat.",
      category: "technology",
      created: now,
      lastUpdated: now
    },
    intent: {
      focus: [
        "Agents SDK",
        "Durable Objects",
        "Sandbox",
        "Browser",
        "MCP",
        "Workflows"
      ],
      ignore: ["unrelated Workers pricing changes", "generic marketing copy"],
      priority: ["Sandbox", "Browser", "Agents SDK"]
    },
    sections: [
      {
        key: "architecture",
        title: "Core Architecture",
        body: `Cloudflare Agents run as Durable Objects with SQLite-backed state.
Each agent instance can keep persistent memory, accept WebSocket clients, and schedule work.
Chat agents build on AIChatAgent with resumable streaming.`
      },
      {
        key: "sdk",
        title: "Agents SDK",
        body: `The Agents SDK provides Agent and AIChatAgent classes, callable RPC, client hooks, and scheduling helpers.
Tools can run on the server, in the browser, or behind human approval.`
      },
      {
        key: "durable-objects",
        title: "Durable Objects",
        body: `Agent state and custom SQL live inside the Durable Object storage for that instance.
Hibernation is supported; work can continue via alarms, schedules, or workflows.`
      },
      {
        key: "browser",
        title: "Browser",
        body: `Browser automation is available as an experimental Agents capability for CDP-driven browsing tasks.
This fixture treats Browser as a watch section for later evidence comparison.`
      },
      {
        key: "sandbox",
        title: "Sandbox",
        body: `Sandbox provides isolated code execution for agents.
This fixture baseline records Sandbox as an important capability area without claiming live limit numbers from the network.`
      },
      {
        key: "mcp",
        title: "MCP",
        body: `Agents can act as MCP clients or expose MCP servers.
MCP tools can be merged into chat toolsets when connected.`
      },
      {
        key: "workflows",
        title: "Workflows",
        body: `Long-running multi-step work should use AgentWorkflow rather than blocking a chat turn.
Workflows are the planned home for research, compare, and patch pipelines.`
      }
    ],
    openQuestions: [
      "Which Sandbox limits should be treated as user-relevant patches?",
      "Which official docs URLs are the canonical evidence sources for each section?"
    ]
  };
}

export async function seedFixtureIfNeeded(
  sql: SqlExecutor,
  bucket: R2Bucket
): Promise<{ seeded: boolean; targetId: string }> {
  ensureRealitySchema(sql);
  const store: RealityStore = { sql, bucket };

  const existing = getTarget(store, FIXTURE_TARGET_ID);
  const existingMarkdown = await getCurrentContextMarkdown(
    store,
    FIXTURE_TARGET_ID
  );

  if (existing && existingMarkdown) {
    return { seeded: false, targetId: FIXTURE_TARGET_ID };
  }

  const fixture = createCloudflareAgentsFixture();
  upsertTarget(store, {
    id: fixture.targetId,
    name: fixture.name,
    description: fixture.profile.description,
    category: fixture.profile.category,
    status: "active",
    intent: fixture.intent,
    createdAt: fixture.profile.created,
    updatedAt: fixture.profile.lastUpdated
  });
  await putCurrentContext(store, fixture);

  return { seeded: true, targetId: FIXTURE_TARGET_ID };
}
