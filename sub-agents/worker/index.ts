import { AIChatAgent } from "@cloudflare/ai-chat";
import { Agent, callable, routeAgentRequest } from "agents";
import { generateText, Output } from "ai";
import { RpcTarget } from "cloudflare:workers";
import { createWorkersAI } from "workers-ai-provider";
import {
  ArgumentSchema,
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

const MODEL = "@cf/zai-org/glm-4.7-flash" as const;

/**
 * Progress callback from Advocate → parent.
 * Updates Orchestrator state so the UI can show live activity per advocate.
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
 * Isolated advocate sub-agent. Has its own memory/storage/lifecycle;
 * only receives (topic, stance) — never the opposing case.
 */
export class Advocate extends Agent<Env> {
  async prepareCase(
    topic: string,
    stanceName: string,
    stanceDescription: string,
    progressReporter: ProgressReporter,
  ): Promise<DebateCase> {
    const workersAi = createWorkersAI({ binding: this.env.AI });
    const model = workersAi(MODEL);

    // One structured LLM call (avoids multi-call RPC timeouts). Progress stages
    // are reported over RpcTarget while generation runs.
    const stages = [
      "모두발언 작성 중...",
      "논거 1/3 준비 중...",
      "논거 2/3 준비 중...",
      "논거 3/3 준비 중...",
      "마무리 발언 작성 중...",
    ];
    let stageIndex = 0;
    progressReporter.report(stages[stageIndex++]);
    const progressTimer = setInterval(() => {
      if (stageIndex < stages.length) {
        progressReporter.report(stages[stageIndex++]);
      }
    }, 2500);

    try {
      const { output } = await generateText({
        model,
        prompt: [
          `당신은 토론 대변인 "${stanceName}"입니다.`,
          `입장: ${stanceDescription}`,
          `주제: ${topic}`,
          "한국어로 설득력 있게 작성하세요.",
          "상대 진영의 주장은 알 수 없고, 알려고 하지 마세요. 오직 자기 입장만 주장하세요.",
          `stance 필드는 반드시 "${stanceName}" 이어야 합니다.`,
          "opening, 서로 다른 논거 정확히 3개(point+reasoning), closing을 모두 채우세요.",
          "각 논거는 구체적이고 중복되지 않게 작성하세요.",
        ].join("\n"),
        output: Output.object({
          schema: ArgumentSchema,
        }),
      });

      if (!output) {
        throw new Error("Advocate failed to produce a structured case");
      }

      const debateCase: DebateCase = {
        ...output,
        stance: stanceName,
      };

      progressReporter.report("주장 준비 완료");
      return debateCase;
    } finally {
      clearInterval(progressTimer);
    }
  }
}

export class Orchestrator extends AIChatAgent<Env, OrchestratorState> {
  initialState: OrchestratorState = {
    status: "idle",
  };

  /**
   * Phase 2 checkpoint: run a single advocate and stream progress via RpcTarget.
   */
  @callable()
  async debugAdvocate(topic: string) {
    const stanceName = "민초단";
    const stanceDescription =
      "민트초코(민초)를 찬성하는 입장. 맛·취향·문화적 가치를 옹호한다.";
    const childName = "advocate-sideA";

    this.setState({
      status: "debating",
      topic,
      sides: {
        sideA: { name: stanceName, stance: stanceDescription },
        sideB: {
          name: "반민초단",
          stance: "(Phase 2 debug — not running)",
        },
      },
      activity: {},
      cases: {},
    });

    const advocate = await this.subAgent(Advocate, childName);
    const reporter = new ProgressReporter(this, childName);
    const debateCase = await advocate.prepareCase(
      topic,
      stanceName,
      stanceDescription,
      reporter,
    );

    this.setState({
      ...this.state,
      status: "done",
      cases: {
        sideA: debateCase,
      },
      activity: {
        ...this.state.activity,
        [childName]: "주장 준비 완료",
      },
    });

    return debateCase;
  }

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
