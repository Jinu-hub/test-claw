import { AIChatAgent } from "@cloudflare/ai-chat";
import { Agent, callable, routeAgentRequest } from "agents";
import { RpcTarget } from "cloudflare:workers";
import {
  type DebateCase,
  type OrchestratorState,
} from "../shared/schemas";

export {
  ArgumentSchema,
  StancesSchema,
  type DebateCase,
  type DebateStatus,
  type OrchestratorState,
  type Stances,
} from "../shared/schemas";

/**
 * Progress callback from Advocate → parent.
 * Phase 2 wires report() to setState; Phase 1 only defines the shape.
 */
export class ProgressReporter extends RpcTarget {
  father: Orchestrator;
  childName: string;

  constructor(father: Orchestrator, childName: string) {
    super();
    this.father = father;
    this.childName = childName;
  }

  report(activity: string) {
    this.father.setState({
      ...this.father.state,
      activity: {
        ...this.father.state.activity,
        [this.childName]: activity,
      },
    });
  }
}

/**
 * Advocate sub-agent — implemented in Phase 2.
 * Exported now so wrangler/ctx.exports can discover the class name.
 */
export class Advocate extends Agent<Env> {
  async prepareCase(
    _topic: string,
    _stanceName: string,
    _stanceDescription: string,
    _progressReporter: ProgressReporter,
  ): Promise<DebateCase> {
    throw new Error("Phase 2: Advocate.prepareCase not implemented yet");
  }
}

export class Orchestrator extends AIChatAgent<Env, OrchestratorState> {
  initialState: OrchestratorState = {
    status: "idle",
  };

  /** Phase 3 will implement full debate orchestration. */
  @callable()
  async debate(_topic: string) {
    throw new Error("Phase 3: Orchestrator.debate not implemented yet");
  }
}

export default {
  async fetch(request, env) {
    console.log("fetch", request.url);
    const agentResponse = await routeAgentRequest(request, env);
    if (agentResponse) return agentResponse;
    return new Response(null, { status: 404 });
  },
} satisfies ExportedHandler<Env>;
