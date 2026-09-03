import { AIChatAgent } from "@cloudflare/ai-chat";
import { routeAgentRequest } from "agents";
import { convertToModelMessages, isLoopFinished, streamText, tool } from "ai";
import { createWorkersAI } from "workers-ai-provider";
import puppeteer, { type Page, type Browser } from "@cloudflare/puppeteer";
import z from "zod";

export type BrowserAgentState = {
  liveUrl: string | null;
};
export class BrowserAgent extends AIChatAgent<Env, BrowserAgentState> {
  initialState = {
    liveUrl: null,
  };

  browser: Browser | null = null;
  page: Page | null = null;
  async getPage() {
    if (this.page && this.browser?.connected) return this.page;
    this.browser = await puppeteer.launch(this.env.BROWSER, {
      recording: true,
    });
    this.page = await this.browser.newPage();
    await this.page.setViewport({
      width: 1280,
      height: 720,
    });
    await this.getLiveViewUrl();
    return this.page;
  }

  async getLiveViewUrl() {
    if (!this.browser) return;

    const sessionId = this.browser.sessionId();

    const res = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${this.env.ACCOUNT_ID}/browser-rendering/devtools/browser/${sessionId}/json/list`,
      {
        headers: {
          Authorization: `Bearer ${this.env.API_TOKEN}`,
        },
      },
    );

    const data = (await res.json()) as {
      type: string;
      devtoolsFrontendUrl: string;
    }[];

    const target = data.find((t) => t.type === "page");
    if (!target) {
      throw new Error("No page target found for DevTools URL");
    }
    const url = target.devtoolsFrontendUrl;
    const liveUrl = new URL(url);
    liveUrl.searchParams.set("mode", "tab");
    this.setState({
      liveUrl: liveUrl.toString(),
    });
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
        takeScreenshot: tool({
          description: "Take a screenshot of the page",
          inputSchema: z.object({}),
          execute: async () => {
            const page = await this.getPage();
            const buffer = await page.screenshot({ type: "jpeg" });
            const key = `screenshots/${Date.now()}.png`;
            await this.env.FILES.put(key, buffer, {
              httpMetadata: {
                contentType: "image/jpeg",
              },
            });
            return { ok: true, filename: key };
          },
        }),
        auditSeo: tool({
          description:
            "Audit the SEO of a page. Checks 8 SEO criteria and returns a score out of 100 along with a screenshot.",
          inputSchema: z.object({
            url: z.url().meta({ description: "The URL to audit" }),
          }),
          execute: async ({ url }) => {
            const page = await this.getPage();
            await page.goto(url, { waitUntil: "networkidle2" });

            const checks = await page.evaluate(() => {
              const results: {
                name: string;
                pass: boolean;
                value: string | null;
              }[] = [];

              // 1. <title> 존재 & 10~60자
              const title = document.querySelector("title")?.textContent ?? null;
              results.push({
                name: "title",
                pass: title !== null && title.length >= 10 && title.length <= 60,
                value: title,
              });

              // 2. <meta name="description"> 존재 & 50~160자
              const desc =
                document
                  .querySelector('meta[name="description"]')
                  ?.getAttribute("content") ?? null;
              results.push({
                name: "meta_description",
                pass:
                  desc !== null && desc.length >= 50 && desc.length <= 160,
                value: desc,
              });

              // 3. <h1>이 정확히 하나
              const h1Count = document.querySelectorAll("h1").length;
              results.push({
                name: "single_h1",
                pass: h1Count === 1,
                value: `${h1Count} <h1> found`,
              });

              // 4. 모든 <img>에 alt 속성
              const images = Array.from(document.querySelectorAll("img"));
              const missingAlt = images.filter(
                (img) => !img.hasAttribute("alt")
              );
              results.push({
                name: "img_alt",
                pass: missingAlt.length === 0,
                value:
                  images.length === 0
                    ? "No images"
                    : `${missingAlt.length}/${images.length} missing alt`,
              });

              // 5. og:title & og:image
              const ogTitle =
                document
                  .querySelector('meta[property="og:title"]')
                  ?.getAttribute("content") ?? null;
              const ogImage =
                document
                  .querySelector('meta[property="og:image"]')
                  ?.getAttribute("content") ?? null;
              results.push({
                name: "og_tags",
                pass: ogTitle !== null && ogImage !== null,
                value: `og:title=${ogTitle ?? "missing"}, og:image=${ogImage ?? "missing"}`,
              });

              // 6. <link rel="canonical">
              const canonical =
                document
                  .querySelector('link[rel="canonical"]')
                  ?.getAttribute("href") ?? null;
              results.push({
                name: "canonical",
                pass: canonical !== null,
                value: canonical,
              });

              // 7. <meta name="viewport">
              const viewport =
                document
                  .querySelector('meta[name="viewport"]')
                  ?.getAttribute("content") ?? null;
              results.push({
                name: "viewport",
                pass: viewport !== null,
                value: viewport,
              });

              // 8. <html lang> 속성
              const lang = document.documentElement.getAttribute("lang");
              results.push({
                name: "html_lang",
                pass: lang !== null && lang.trim().length > 0,
                value: lang,
              });

              return results;
            });

            // 점수 계산 (코드에서 직접)
            const passCount = checks.filter((c) => c.pass).length;
            const score = passCount * 12.5;

            // 스크린샷 촬영 & R2 저장
            const buffer = await page.screenshot({ type: "jpeg" });
            const screenshotKey = `screenshots/seo-${Date.now()}.jpg`;
            await this.env.FILES.put(screenshotKey, buffer, {
              httpMetadata: { contentType: "image/jpeg" },
            });

            return { score, checks, screenshotKey };
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
    const url = new URL(request.url);
    if (url.pathname.startsWith("/screenshots")) {
      const key = url.pathname.slice(1);
      const file = await env.FILES.get(key);
      if (file) {
        return new Response(file.body, {
          headers: {
            "Content-Type": file.httpMetadata?.contentType ?? "image/png",
          },
        });
      }
    }
    return (
      (await routeAgentRequest(request, env)) ??
      new Response(null, { status: 404 })
    );
  },
} satisfies ExportedHandler<Env>;