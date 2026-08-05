import { AIChatAgent } from "@cloudflare/ai-chat";
import { routeAgentRequest } from "agents";
import { convertToModelMessages, isLoopFinished, streamText, tool } from "ai";
import { createWorkersAI } from "workers-ai-provider";
import puppeteer, { type Page, type Browser } from "@cloudflare/puppeteer";
import z from "zod";


export class BrowserAgent extends AIChatAgent<Env> {

  browser: Browser | null = null;
  page: Page | null = null;
  async getPage() {
    if (this.page && this.browser?.connected) return this.page;
    this.browser = await puppeteer.launch(this.env.BROWSER);
    this.page = await this.browser.newPage();
    await this.page.setViewport({
      width: 1280,
      height: 720,
    });
    return this.page;
  }

  async closeBrowser() {
    await this.browser?.close();
    this.browser = null;
    this.page = null;
  }

  async onChatMessage() {
    const workersAi = createWorkersAI({ binding: this.env.AI });

    const result = streamText({
      model: workersAi("@cf/zai-org/glm-4.7-flash"),
      system: "You can browse the web and inspect pages.",
      messages: await convertToModelMessages(this.messages),
      tools: {
        navigate: tool({
          description: "Navigate to a website",
          inputSchema: z.object({
            url: z.url().meta({
              description:
                "The url of the page that you want to go to with https://",
            }),
          }),
          execute: async ({ url }) => {
            const page = await this.getPage();
            await page.goto(url);
            return { ok: true, title: await page.title() };
          },
        }),
        closeBrowser: tool({
          description: "Close the browser session",
          inputSchema: z.object({}),
          execute: async () => {
            await this.closeBrowser();
            return { ok: true };
          },
        }),
      },
      stopWhen: isLoopFinished(),
    });

    return result.toUIMessageStreamResponse();
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