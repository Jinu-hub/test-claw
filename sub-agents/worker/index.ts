import { AIChatAgent } from "@cloudflare/ai-chat";
import { Agent, callable, routeAgentRequest } from "agents";
import {
  generateText,
  Output,
  streamText,
  type StreamTextOnFinishCallback,
  type ToolSet,
} from "ai";
import { RpcTarget } from "cloudflare:workers";
import { createWorkersAI } from "workers-ai-provider";
import {
  ArgumentSchema,
  StancesSchema,
  type DebateCase,
  type OrchestratorState,
  type Stances,
} from "../shared/schemas";
import type { z } from "zod";

export {
  ArgumentSchema,
  StancesSchema,
  type DebateCase,
  type DebateStatus,
  type OrchestratorState,
  type Stances,
} from "../shared/schemas";

const MODEL = "@cf/zai-org/glm-4.7-flash" as const;

function extractJsonObject(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1]?.trim() ?? text.trim();
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("No JSON object found in model response");
  }
  return JSON.parse(candidate.slice(start, end + 1));
}

/**
 * Workers AI + Output.object is flaky ("No object generated: could not parse").
 * Try structured output first, then fall back to JSON-in-text + Zod parse (+ one repair).
 */
async function generateStructured<T>(
  model: ReturnType<ReturnType<typeof createWorkersAI>>,
  schema: z.ZodType<T>,
  prompt: string,
): Promise<T> {
  try {
    const { output } = await generateText({
      model,
      prompt,
      output: Output.object({ schema }),
    });
    if (output != null) {
      return schema.parse(output);
    }
  } catch {
    // Fall through to JSON text fallback.
  }

  const jsonPrompt = [
    prompt,
    "",
    "응답은 설명 없이 JSON 객체 하나만 출력하세요.",
    "마크다운 코드펜스 없이 raw JSON만 반환하세요.",
  ].join("\n");

  const { text } = await generateText({
    model,
    prompt: jsonPrompt,
  });

  try {
    return schema.parse(extractJsonObject(text));
  } catch (firstError) {
    const { text: repaired } = await generateText({
      model,
      prompt: [
        "다음 텍스트를 유효한 JSON 객체로만 고쳐 주세요. 설명 금지.",
        `스키마 오류/이슈: ${firstError instanceof Error ? firstError.message : String(firstError)}`,
        "",
        text,
      ].join("\n"),
    });
    return schema.parse(extractJsonObject(repaired));
  }
}

function formatCaseForJudge(label: string, debateCase: DebateCase): string {
  const args = debateCase.arguments
    .map((arg, i) => `  논거 ${i + 1}. [${arg.point}] ${arg.reasoning}`)
    .join("\n");
  return [
    `진영: ${label}`,
    `모두발언: ${debateCase.opening}`,
    args,
    `마무리: ${debateCase.closing}`,
  ].join("\n");
}

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
      const output = await generateStructured<DebateCase>(
        model,
        ArgumentSchema,
        [
          `당신은 토론 대변인 "${stanceName}"입니다.`,
          `입장: ${stanceDescription}`,
          `주제: ${topic}`,
          "한국어로 설득력 있게 작성하세요.",
          "상대 진영의 주장은 알 수 없고, 알려고 하지 마세요. 오직 자기 입장만 주장하세요.",
          "주제를 다른 의미로 바꾸지 마세요. 예: '민초'는 민트초코이며 정치/정당 이야기가 아닙니다.",
          `stance 필드는 반드시 "${stanceName}" 이어야 합니다.`,
          "JSON 필드: stance, opening, arguments(길이 정확히 3, 각 항목은 point+reasoning), closing",
          "각 논거는 구체적이고 중복되지 않게 작성하세요.",
        ].join("\n"),
      );

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
   * Judge turn: stream a verdict that names the winner and the decisive argument.
   * Triggered by saveMessages after both advocate cases arrive.
   */
  async onChatMessage(
    onFinish: StreamTextOnFinishCallback<ToolSet>,
    options?: { abortSignal?: AbortSignal },
  ) {
    const workersAi = createWorkersAI({ binding: this.env.AI });
    const model = workersAi(MODEL);
    const { topic, sides, cases, status } = this.state;

    if (
      status === "judging" &&
      sides &&
      cases?.sideA &&
      cases?.sideB
    ) {
      const result = streamText({
        model,
        system: [
          "당신은 공정한 토론 심판입니다.",
          "양쪽 구조화된 주장만 비교해 승자를 정하세요.",
          "반드시 포함할 것:",
          "1) 승자 진영 이름 (예: 승자는 민초단입니다)",
          "2) 판정에 결정적이었던 구체적 논거(point 문구를 인용)",
          "3) 왜 그 논거가 상대를 이겼는지 짧은 이유",
          "한국어로 자연스럽게 작성하세요. 서두는 '양쪽 주장이 모두 도착했습니다.'로 시작하세요.",
        ].join("\n"),
        prompt: [
          `주제: ${topic ?? "(없음)"}`,
          "",
          formatCaseForJudge(sides.sideA.name, cases.sideA),
          "",
          formatCaseForJudge(sides.sideB.name, cases.sideB),
          "",
          "위 두 주장을 비교해 판정문을 작성하세요.",
        ].join("\n"),
        abortSignal: options?.abortSignal,
        onFinish,
      });

      return result.toUIMessageStreamResponse();
    }

    const result = streamText({
      model,
      system:
        "Debate Arena입니다. 사용자는 상단 Debate 버튼으로 토론을 시작합니다. 짧게 안내하세요.",
      prompt:
        "토론을 시작하려면 상단에 주제를 입력하고 Debate 버튼을 눌러 주세요.",
      abortSignal: options?.abortSignal,
      onFinish,
    });
    return result.toUIMessageStreamResponse();
  }

  /**
   * Extract two opposing stances from a free-form topic, spawn isolated
   * advocates, and run them concurrently. Neither advocate sees the other case.
   * When both cases arrive, stream a judge verdict into chat via saveMessages.
   */
  @callable()
  async reset() {
    this.setState({
      status: "idle",
      topic: undefined,
      sides: undefined,
      activity: undefined,
      cases: undefined,
    });
  }

  @callable()
  async debate(topic: string) {
    const workersAi = createWorkersAI({ binding: this.env.AI });
    const model = workersAi(MODEL);

    this.setState({
      status: "extracting",
      topic,
      sides: undefined,
      activity: {},
      cases: {},
    });

    const sides = await generateStructured<Stances>(
      model,
      StancesSchema,
      [
        "당신은 한국어 인터넷 논쟁 주제를 양쪽 진영으로 나누는 도우미입니다.",
        "다음 주제에서 대립하는 양쪽 입장을 추출하세요.",
        "각 진영에 짧고 명확한 이름(name)과 한 문장 입장(stance)을 주세요.",
        "JSON 필드: sideA{name,stance}, sideB{name,stance}",
        "",
        "중요 — 한국어 줄임말/취향 논쟁을 정치로 해석하지 마세요:",
        "- '민초' = 민트 초콜릿(민트초코). 민초단(찬성) vs 반민초단(반대).",
        "- '부먹/찍먹' = 탕수육을 소스에 부어 먹기 vs 찍어 먹기.",
        "- '깻잎논쟁' = 연인의 깻잎을 同行이 떼어줘도 되는지 등 연애/예절 논쟁.",
        "정치·정당·정책 주제로 바꾸지 마세요. 주제에 나온 취향/음식/문화 논쟁 그대로 유지하세요.",
        "주제에 명시된 양쪽이 있으면 그것을 쓰고, 없으면 같은 주제 안에서만 양분하세요.",
        "",
        `주제: ${topic}`,
      ].join("\n"),
    );

    this.setState({
      ...this.state,
      status: "debating",
      sides,
      activity: {},
      cases: {},
    });

    const sideKeys = ["sideA", "sideB"] as const;
    const [caseA, caseB] = await Promise.all(
      sideKeys.map(async (key) => {
        const side = sides[key];
        const childName = `advocate-${key}`;
        const advocate = await this.subAgent(Advocate, childName);
        const reporter = new ProgressReporter(this, childName);
        // Only this side's stance is passed — never the opponent's case.
        return advocate.prepareCase(
          topic,
          side.name,
          side.stance,
          reporter,
        );
      }),
    );

    this.setState({
      ...this.state,
      status: "judging",
      cases: {
        sideA: caseA,
        sideB: caseB,
      },
      activity: {
        ...this.state.activity,
        "advocate-sideA": "주장 준비 완료",
        "advocate-sideB": "주장 준비 완료",
      },
    });

    // Persist a turn trigger and stream the judge verdict via onChatMessage.
    await this.saveMessages((messages) => [
      ...messages,
      {
        id: crypto.randomUUID(),
        role: "user",
        parts: [
          {
            type: "text",
            text: `주제「${topic}」에 대한 양쪽 주장이 모두 도착했습니다. 승자와 결정적 논거를 밝히며 판정해 주세요.`,
          },
        ],
      },
    ]);

    this.setState({
      ...this.state,
      status: "done",
    });

    return { sides, cases: { sideA: caseA, sideB: caseB } };
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
