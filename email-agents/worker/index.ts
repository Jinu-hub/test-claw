import { AIChatAgent } from "@cloudflare/ai-chat";
import { routeAgentRequest } from "agents";

export class EmailAgent extends AIChatAgent<Env> {}

export default {
  async fetch(request, env) {
    return (
      (await routeAgentRequest(request, env)) ??
      new Response(null, { status: 404 })
    );
  },
  email(message) {
    console.log(message.headers);
  },
} satisfies ExportedHandler<Env>;
