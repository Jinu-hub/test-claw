import { AIChatAgent } from "@cloudflare/ai-chat";
import { routeAgentEmail, routeAgentRequest } from "agents";
import { createAddressBasedEmailResolver, type AgentEmail } from "agents/email";
import { convertToModelMessages, isLoopFinished, streamText, tool } from "ai";
import PostalMime from "postal-mime";
import { createWorkersAI } from "workers-ai-provider";
import z from "zod";
export class EmailAgent extends AIChatAgent<Env> {
  async onChatMessage() {
    const workersAi = createWorkersAI({
      binding: this.env.AI,
    });
    const result = streamText({
      model: workersAi("@cf/zai-org/glm-4.7-flash"),
      messages: await convertToModelMessages(this.messages),
      tools: {
        sendTranscript: tool({
          description: "Send the transcript of the conversation to the user",
          inputSchema: z.object({
            email: z.string().meta({ description: "The email of the user" }),
          }),
          execute: async ({ email }) => {
            await this.sendEmail({
              binding: this.env.EMAIL,
              to: email,
              from: "youragetn@agent.com",
              subject: "Transcript",
              text: JSON.stringify(this.messages),
            });
            return { success: true, sentTo: email };
          },
        }),
      },
      stopWhen: isLoopFinished(),
    });
    return result.toUIMessageStreamResponse();
  }

  async onEmail(email: AgentEmail) {
   // const raw = await email.getRaw();
    // const parsed = await PostalMime.parse(raw);

    await this.replyToEmail(email, {
      fromName: "EmailAgent",
      subject: "Im answering you",
      contentType: "text/plain",
      body: `Thank you for your email!`,
    });
  }
}

export default {
  async fetch(request, env) {
    return (
      (await routeAgentRequest(request, env)) ??
      new Response(null, { status: 404 })
    );
  },
  async email(message, env) {
    await routeAgentEmail(message, env, {
      resolver: createAddressBasedEmailResolver("EmailAgent"),
    });
  },
} satisfies ExportedHandler<Env>;
