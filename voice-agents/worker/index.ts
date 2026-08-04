import { Agent, routeAgentRequest } from "agents";
import { withVoice } from "@cloudflare/voice";

const VoiceAgentBase = withVoice(Agent);

export class VoiceAgent extends VoiceAgentBase<Env> {}

export default {
  async fetch(request, env) {
    return (
      (await routeAgentRequest(request, env)) ??
      new Response(null, { status: 404 })
    );
  },
} satisfies ExportedHandler<Env>;
