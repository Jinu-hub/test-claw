import { AIChatAgent } from "@cloudflare/ai-chat";
import { callable, routeAgentRequest } from "agents";
import { createWorkersAI } from "workers-ai-provider";
import {
  convertToModelMessages,
  streamText,
  type StreamTextOnFinishCallback,
  type ToolSet,
} from "ai";
import {
  buildSystemPrompt,
  buildWinSystemPrompt,
  buildWrongGuessSystemPrompt,
  checkGuess,
  createInitialState,
  getLastUserMessageText,
  isDirectGuess,
  trimMessagesForContext,
  type Category,
  type GameState,
} from "./game";
import { bufferedSanitizeTransform } from "./stream";

export type { Category, GameState, PublicGameView } from "./game";

const MODEL = "@cf/meta/llama-3.1-8b-instruct-fp8" as const;
const MAX_OUTPUT_TOKENS = 60;
const MAX_CONTEXT_MESSAGES = 8;

export class TwentyQuestionsAgent extends AIChatAgent<Env, GameState> {
  initialState: GameState = createInitialState();

  async onChatMessage(
    _onFinish: StreamTextOnFinishCallback<ToolSet>,
    options?: { abortSignal?: AbortSignal },
  ) {
    const userText = getLastUserMessageText(this.messages);
    const wasSolved = this.state.solved;
    let correctGuess = false;

    if (userText && !wasSolved) {
      correctGuess = checkGuess(userText, this.state.secret);
      if (correctGuess) {
        this.setState({
          ...this.state,
          solved: true,
          questionCount: this.state.questionCount + 1,
        });
      } else {
        this.setState({
          ...this.state,
          questionCount: this.state.questionCount + 1,
        });
      }
    }

    const workersAi = createWorkersAI({
      binding: this.env.AI,
    });

    const system = this.state.solved
      ? buildWinSystemPrompt(this.state.secret)
      : userText && isDirectGuess(userText) && !correctGuess
        ? buildWrongGuessSystemPrompt(userText)
        : buildSystemPrompt(this.state.secret, this.state.category);

    const contextMessages = trimMessagesForContext(
      this.messages,
      MAX_CONTEXT_MESSAGES,
    );

    const isWrongDirectGuess =
      Boolean(userText) && isDirectGuess(userText!) && !correctGuess && !this.state.solved;

    const result = streamText({
      model: workersAi(MODEL),
      system,
      messages: await convertToModelMessages(contextMessages),
      maxOutputTokens: isWrongDirectGuess ? 8 : MAX_OUTPUT_TOKENS,
      temperature: 0,
      abortSignal: options?.abortSignal,
      experimental_transform: bufferedSanitizeTransform(),
    });

    return result.toUIMessageStreamResponse({ sendReasoning: false });
  }

  @callable()
  async newGame(category: Category) {
    this.setState(createInitialState(category));
  }
}

export default {
  async fetch(request, env) {
    return (
      (await routeAgentRequest(request, env)) ??
      new Response(null, { status: 404 })
    );
  },
} satisfies ExportedHandler<Env>;
