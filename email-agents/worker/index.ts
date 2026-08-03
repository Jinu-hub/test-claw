import { AIChatAgent } from "@cloudflare/ai-chat";
import { getAgentByName, routeAgentEmail, routeAgentRequest } from "agents";
import { createAddressBasedEmailResolver, type AgentEmail } from "agents/email";
import { convertToModelMessages, isLoopFinished, streamText, tool } from "ai";
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
            const taskId = await this.queue("sendSlowEmail", {
              email,
              messages: JSON.stringify(this.messages),
            });
            return { success: true, taskId };
          },
        }),
      },
      stopWhen: isLoopFinished(),
    });
    return result.toUIMessageStreamResponse();
  }

  async sendSlowEmail({
    email,
    messages,
  }: {
    email: string;
    messages: string;
  }) {
    await new Promise((resolve) => setTimeout(resolve, 30000));
    try {
      await this.retry(
        async (_attempt) => {
          await this.sendEmail({
            binding: this.env.EMAIL,
            to: email,
            from: "youragetn@agent.com",
            subject: "Transcript",
            text: JSON.stringify(messages),
          });
        },
        {
          maxAttempts: 10,
        },
      );
    } catch {
      console.log("10 attemps failed.");
    }
    console.log("slow email processed");
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

  async onRequest(_request: Request) {
    const stable = await this.waitUntilStable({ timeout: 60_000 });

    if (!stable) return new Response("not stable", { status: 500 });

    await this.persistMessages([
      ...this.messages,
      {
        id: crypto.randomUUID(),
        role: "user",
        parts: [
          {
            type: "text",
            text: "my name is jinu",
          },
        ],
      },
    ]);

    // await this.saveMessages((messages) => [
    //   ...messages,
    //   {
    //     id: crypto.randomUUID(),
    //     role: "system",
    //     parts: [
    //       {
    //         type: "text",
    //         text: "Hello i've been hit from a webhook!",
    //       },
    //     ],
    //   },
    // ]);
    return new Response("ok");
  }

}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/webhook") {
      const agentId = url.searchParams.get("agentId") ?? "default";
      const agent = await getAgentByName(env.EmailAgent, agentId);
      return agent.fetch(request);
    }
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
