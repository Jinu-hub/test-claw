import { createWorkersAI } from "workers-ai-provider";
import { callable, routeAgentRequest, type Schedule } from "agents";
import { AIChatAgent, type OnChatMessageOptions } from "@cloudflare/ai-chat";
import {
  convertToModelMessages,
  pruneMessages,
  stepCountIs,
  streamText
} from "ai";
import { MAX_PERSISTED_MESSAGES } from "./constants";
import { featureFlags } from "./feature-flags";
import { configureMcpOAuth } from "./features/mcp";
import {
  buildInitialRealityContext,
  ensureRealitySchema,
  getCurrentContext,
  getCurrentContextMarkdown,
  getSourcePack,
  getTarget,
  isRealityInitialized,
  listTargets,
  parseScheduledTaskPayload,
  scanTarget,
  seedFixtureIfNeeded,
  type RealityStore,
  type ScanTargetResult
} from "./reality";
import { collectServerTools, composeSystemPrompt } from "./tools";
import {
  MAX_TOOL_STEPS,
  REALITY_INITIALIZED_TYPE,
  REALITY_SCANNED_TYPE,
  SCHEDULED_TASK_TYPE
} from "./tools/shared";

export { InitializeRealityWorkflow } from "./workflows/initialize-reality";
export { ScanTargetWorkflow } from "./workflows/scan-target";

export class ChatAgent extends AIChatAgent<Env> {
  maxPersistedMessages = MAX_PERSISTED_MESSAGES;
  chatRecovery = true;
  // Wait for MCP connections to be re-established after hibernation before
  // processing a message, so MCP tools aren't intermittently missing.
  waitForMcpConnections = featureFlags.mcp;

  async onStart() {
    if (featureFlags.mcp) {
      configureMcpOAuth(this);
    }

    ensureRealitySchema(this.sql.bind(this));
    await seedFixtureIfNeeded(this.sql.bind(this), this.env.REALITY_BUCKET);
  }

  getRealityStore(): RealityStore {
    return {
      sql: this.sql.bind(this),
      bucket: this.env.REALITY_BUCKET
    };
  }

  async prepareInitializeReality(targetId: string, force = false) {
    const store = this.getRealityStore();
    const target = getTarget(store, targetId);
    if (!target) {
      throw new Error(`Target not found: ${targetId}`);
    }

    const pack = getSourcePack(target);
    if (!pack) {
      throw new Error(
        `No canonical source pack for "${target.name}". Phase 4 currently supports Cloudflare Agents.`
      );
    }

    const existing = await getCurrentContext(store, targetId);
    if (!force && isRealityInitialized(existing)) {
      throw new Error(
        `Reality for "${target.name}" is already initialized. Pass force=true to rebuild from sources.`
      );
    }

    return {
      targetId: target.id,
      name: target.name,
      packId: pack.id,
      sourceCount: pack.sources.length
    };
  }

  async runInitializeReality(targetId: string) {
    const store = this.getRealityStore();
    const target = getTarget(store, targetId);
    if (!target) {
      throw new Error(`Target not found: ${targetId}`);
    }

    return buildInitialRealityContext({
      store,
      ai: this.env.AI,
      target
    });
  }

  async startInitializeReality(targetId: string, force = false) {
    await this.prepareInitializeReality(targetId, force);
    const workflowId = await this.runWorkflow("INITIALIZE_REALITY_WORKFLOW", {
      targetId,
      force
    });
    return { workflowId, targetId, force };
  }

  async prepareScanTarget(targetId: string) {
    const store = this.getRealityStore();
    const target = getTarget(store, targetId);
    if (!target) {
      throw new Error(`Target not found: ${targetId}`);
    }

    const pack = getSourcePack(target);
    if (!pack) {
      throw new Error(
        `No canonical source pack for "${target.name}". Phase 6 currently supports Cloudflare Agents.`
      );
    }

    const existing = await getCurrentContext(store, targetId);
    if (!isRealityInitialized(existing)) {
      throw new Error(
        `Reality for "${target.name}" is not initialized. Run initializeReality first.`
      );
    }

    return {
      targetId: target.id,
      name: target.name,
      packId: pack.id
    };
  }

  async runScanTarget(targetId: string): Promise<ScanTargetResult> {
    const store = this.getRealityStore();
    const target = getTarget(store, targetId);
    if (!target) {
      throw new Error(`Target not found: ${targetId}`);
    }

    return scanTarget({
      store,
      ai: this.env.AI,
      target
    });
  }

  async startScanTarget(targetId: string) {
    await this.prepareScanTarget(targetId);
    const workflowId = await this.runWorkflow("SCAN_TARGET_WORKFLOW", {
      targetId
    });
    return { workflowId, targetId };
  }

  async onWorkflowComplete(
    workflowName: string,
    _instanceId: string,
    result?: unknown
  ) {
    if (workflowName === "INITIALIZE_REALITY_WORKFLOW") {
      const payload =
        result && typeof result === "object"
          ? (result as {
              targetId?: string;
              name?: string;
              sectionKeys?: string[];
              sourcesFetched?: number;
            })
          : {};

      this.broadcast(
        JSON.stringify({
          type: REALITY_INITIALIZED_TYPE,
          targetId: payload.targetId ?? "",
          name: payload.name ?? "",
          sectionKeys: payload.sectionKeys ?? [],
          sourcesFetched: payload.sourcesFetched ?? 0,
          timestamp: new Date().toISOString()
        })
      );
      return;
    }

    if (workflowName !== "SCAN_TARGET_WORKFLOW") return;
    const payload =
      result && typeof result === "object"
        ? (result as {
            targetId?: string;
            name?: string;
            patchesCreated?: number;
            patchedSectionKeys?: string[];
            proposalsCreated?: number;
            proposedSectionKeys?: string[];
            skipped?: number;
            llmCalled?: boolean;
            message?: string;
          })
        : {};

    this.broadcast(
      JSON.stringify({
        type: REALITY_SCANNED_TYPE,
        targetId: payload.targetId ?? "",
        name: payload.name ?? "",
        patchesCreated: payload.patchesCreated ?? 0,
        patchedSectionKeys: payload.patchedSectionKeys ?? [],
        proposalsCreated: payload.proposalsCreated ?? 0,
        proposedSectionKeys: payload.proposedSectionKeys ?? [],
        skipped: payload.skipped ?? 0,
        llmCalled: payload.llmCalled ?? false,
        message: payload.message ?? "",
        timestamp: new Date().toISOString()
      })
    );
  }

  @callable()
  async listStoredTargets() {
    return listTargets(this.getRealityStore());
  }

  @callable()
  async getStoredContext(targetId = "target_cf_agents") {
    const markdown = await getCurrentContextMarkdown(
      this.getRealityStore(),
      targetId
    );
    return {
      targetId,
      found: Boolean(markdown),
      markdown
    };
  }

  @callable()
  async addServer(name: string, url: string) {
    return await this.addMcpServer(name, url);
  }

  @callable()
  async removeServer(serverId: string) {
    await this.removeMcpServer(serverId);
  }

  async onChatMessage(_onFinish: unknown, options?: OnChatMessageOptions) {
    const workersai = createWorkersAI({ binding: this.env.AI });

    const result = streamText({
      model: workersai("@cf/moonshotai/kimi-k2.7-code", {
        sessionAffinity: this.sessionAffinity
      }),
      system: composeSystemPrompt(),
      // Prune old tool calls and reasoning to save tokens on long conversations
      messages: pruneMessages({
        messages: await convertToModelMessages(this.messages),
        toolCalls: "before-last-2-messages",
        reasoning: "before-last-message"
      }),
      tools: collectServerTools(this),
      stopWhen: stepCountIs(MAX_TOOL_STEPS),
      abortSignal: options?.abortSignal
    });

    return result.toUIMessageStreamResponse();
  }

  async executeTask(payload: unknown, _task: Schedule<unknown>) {
    const parsed = parseScheduledTaskPayload(payload);

    if (parsed.kind === "scan-target") {
      console.log(
        `Executing scheduled scan for ${parsed.targetId} (${parsed.name ?? "target"})`
      );
      try {
        await this.startScanTarget(parsed.targetId);
      } catch (error) {
        this.broadcast(
          JSON.stringify({
            type: REALITY_SCANNED_TYPE,
            targetId: parsed.targetId,
            name: parsed.name ?? "",
            patchesCreated: 0,
            patchedSectionKeys: [],
            skipped: 0,
            llmCalled: false,
            message: error instanceof Error ? error.message : String(error),
            timestamp: new Date().toISOString()
          })
        );
      }
      return;
    }

    console.log(`Executing scheduled task: ${String(payload)}`);
    this.broadcast(
      JSON.stringify({
        type: SCHEDULED_TASK_TYPE,
        description: String(payload),
        timestamp: new Date().toISOString()
      })
    );
  }
}

export default {
  async fetch(request: Request, env: Env) {
    return (
      (await routeAgentRequest(request, env)) ||
      new Response("Not found", { status: 404 })
    );
  }
} satisfies ExportedHandler<Env>;
