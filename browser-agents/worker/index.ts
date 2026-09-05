import { AIChatAgent } from "@cloudflare/ai-chat";
import { callable, routeAgentRequest } from "agents";
import { convertToModelMessages, isLoopFinished, streamText, tool } from "ai";
import { createWorkersAI } from "workers-ai-provider";
import puppeteer, { type Page, type Browser } from "@cloudflare/puppeteer";
import z from "zod";

/** Max navigation hops per exploration session (enforced in code, not by the model). */
export const MAX_HOPS = 5;

export type BrowserAgentState = {
  liveUrl: string | null;
  /** Why Live View is unavailable (missing secrets, API error, etc.) */
  liveViewError: string | null;
  /** Groups R2 evidence under evidence/{explorationId}/… */
  explorationId: string | null;
  /** R2 keys for screenshots, in visit order */
  evidence: string[];
  /** Number of followLink navigations in the current exploration */
  hopCount: number;
};

export class BrowserAgent extends AIChatAgent<Env, BrowserAgentState> {
  initialState: BrowserAgentState = {
    liveUrl: null,
    liveViewError: null,
    explorationId: null,
    evidence: [],
    hopCount: 0,
  };

  browser: Browser | null = null;
  page: Page | null = null;

  /** Whether another followLink is allowed. */
  canHop(): boolean {
    return this.state.hopCount < MAX_HOPS;
  }

  /** Record a successful navigation: bump hopCount and append evidence key. */
  recordHop(screenshotKey: string) {
    this.setState({
      ...this.state,
      hopCount: this.state.hopCount + 1,
      evidence: [...this.state.evidence, screenshotKey],
    });
  }

  /** Start a new exploration folder + hop budget (keeps liveUrl if browser still open). */
  resetExploration() {
    this.setState({
      ...this.state,
      explorationId: crypto.randomUUID(),
      hopCount: 0,
      evidence: [],
    });
  }

  /** Ensure an explorationId exists (for screenshots before resetExploration). */
  ensureExplorationId(): string {
    if (this.state.explorationId) return this.state.explorationId;
    const explorationId = crypto.randomUUID();
    this.setState({
      ...this.state,
      explorationId,
    });
    return explorationId;
  }

  /** Delete all R2 objects for an exploration prefix (and any listed evidence keys). */
  async deleteEvidenceObjects(explorationId: string | null, keys: string[]) {
    const toDelete = new Set(keys);

    if (explorationId) {
      const prefix = `evidence/${explorationId}/`;
      let cursor: string | undefined;
      do {
        const listed = await this.env.FILES.list({
          prefix,
          cursor,
          limit: 1000,
        });
        for (const obj of listed.objects) {
          toDelete.add(obj.key);
        }
        cursor = listed.truncated ? listed.cursor : undefined;
      } while (cursor);
    }

    await Promise.all(
      [...toDelete].map((key) => this.env.FILES.delete(key).catch(() => {})),
    );
  }

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
    // Live View must not block browsing if secrets/API fail
    await this.getLiveViewUrl().catch(() => {});
    return this.page;
  }

  async getLiveViewUrl() {
    if (!this.browser) return;

    const accountId = this.env.ACCOUNT_ID;
    const apiToken = this.env.API_TOKEN;
    if (!accountId || !apiToken || accountId.includes("yyyy") || apiToken.includes("xxxx")) {
      this.setState({
        ...this.state,
        liveUrl: null,
        liveViewError:
          "ACCOUNT_ID / API_TOKEN secrets are missing or still placeholders. Set them with: wrangler secret put ACCOUNT_ID && wrangler secret put API_TOKEN",
      });
      return;
    }

    const sessionId = this.browser.sessionId();

    try {
      const res = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${accountId}/browser-rendering/devtools/browser/${sessionId}/json/list`,
        {
          headers: {
            Authorization: `Bearer ${apiToken}`,
          },
        },
      );

      const data = (await res.json()) as
        | { type: string; devtoolsFrontendUrl: string }[]
        | { success?: boolean; errors?: { message: string }[]; result?: unknown };

      const list = Array.isArray(data)
        ? data
        : Array.isArray((data as { result?: unknown }).result)
          ? ((data as { result: { type: string; devtoolsFrontendUrl: string }[] }).result)
          : null;

      if (!list) {
        const msg = !Array.isArray(data)
          ? ((data as { errors?: { message: string }[] }).errors?.[0]?.message ??
            `Live View API error (HTTP ${res.status})`)
          : "Unexpected Live View API response";
        this.setState({
          ...this.state,
          liveUrl: null,
          liveViewError: msg,
        });
        return;
      }

      const target = list.find((t) => t.type === "page");
      if (!target?.devtoolsFrontendUrl) {
        this.setState({
          ...this.state,
          liveUrl: null,
          liveViewError: "No page target found for DevTools Live View URL",
        });
        return;
      }

      const liveUrl = new URL(target.devtoolsFrontendUrl);
      liveUrl.searchParams.set("mode", "tab");
      this.setState({
        ...this.state,
        liveUrl: liveUrl.toString(),
        liveViewError: null,
      });
    } catch (err) {
      this.setState({
        ...this.state,
        liveUrl: null,
        liveViewError:
          err instanceof Error ? err.message : "Failed to fetch Live View URL",
      });
    }
  }

  async closeBrowser() {
    await this.browser?.close();
    this.browser = null;
    this.page = null;
    // Keep evidence/hopCount so the UI can show the trail until the next user turn
    this.setState({
      ...this.state,
      liveUrl: null,
      liveViewError: this.state.liveViewError,
    });
  }

  /** Clear chat-side session UI state: close browser, wipe R2 evidence prefix, reset state. */
  @callable()
  async clearSession() {
    const { explorationId, evidence } = this.state;
    await this.deleteEvidenceObjects(explorationId, evidence);

    try {
      await this.browser?.close();
    } catch {
      // already closed
    }
    this.browser = null;
    this.page = null;

    this.setState({
      liveUrl: null,
      liveViewError: null,
      explorationId: null,
      evidence: [],
      hopCount: 0,
    });
    return { ok: true as const };
  }

  /** Capture current page to R2 under evidence/{explorationId}/… */
  async saveScreenshotToR2(): Promise<string> {
    const page = await this.getPage();
    const buffer = await page.screenshot({ type: "jpeg" });
    const explorationId = this.ensureExplorationId();
    const key = `evidence/${explorationId}/${Date.now()}.jpg`;
    await this.env.FILES.put(key, buffer, {
      httpMetadata: { contentType: "image/jpeg" },
    });
    return key;
  }

  /** Append an evidence key without incrementing hopCount (for screenshot tool). */
  appendEvidence(screenshotKey: string) {
    this.setState({
      ...this.state,
      evidence: [...this.state.evidence, screenshotKey],
    });
  }

  async onChatMessage() {
    // Fresh hop budget per user turn (avoids stale hopCount from prior explorations)
    this.resetExploration();

    const workersAi = createWorkersAI({ binding: this.env.AI });

    const result = streamText({
      model: workersAi("@cf/zai-org/glm-4.7-flash"),
      system: `You are a web exploration agent. You share ONE browser session across tool calls.

## Tools for exploration (prefer these)
- followLink(href): open a start URL or a link. Counts as 1 hop (max ${MAX_HOPS}). Auto-saves a screenshot.
- readPage(): read current page text + links, then decide the next action.
- screenshot(): optional extra capture (does NOT count as a hop).
- closeBrowser(): end the session when done (saves Browser Run minutes).

Do NOT use navigate or takeScreenshot for exploration Q&A — use followLink / readPage / screenshot instead.
(auditSeo is only for SEO audit requests.)

## Exploration loop
1. Start with followLink to the site/home URL the user gave (or a sensible start URL).
2. Call readPage.
3. If the page answers the question: stop exploring, write the final report, then closeBrowser.
4. If not: pick the single most promising link from readPage and followLink it.
5. Repeat steps 2–4.
6. Hard limit: at most ${MAX_HOPS} followLink calls. If followLink returns ok:false (max hops), stop immediately, report what you found or that you could not find the answer, then closeBrowser.

## Final answer format (always)
- The answer (or clearly say you could not find it)
- The page URL where you found it (or last page checked)
- The path you took (URLs / link texts in order)
- hopCount used

Reply in the user's language.`,
      messages: await convertToModelMessages(this.messages),
      tools: {
        navigate: tool({
          description:
            "Low-level navigate without hop counting or evidence. Prefer followLink for exploration.",
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
          description:
            "Close the browser session and reset exploration state. Call this after finishing your answer.",
          inputSchema: z.object({}),
          execute: async () => {
            await this.closeBrowser();
            return { ok: true };
          },
        }),
        takeScreenshot: tool({
          description:
            "Legacy screenshot tool. Prefer screenshot() for exploration evidence.",
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
        readPage: tool({
          description:
            "Read the current page: return visible text and all links so you can decide where to go next. Call this after followLink.",
          inputSchema: z.object({}),
          execute: async () => {
            const page = await this.getPage();
            const data = await page.evaluate(() => {
              const MAX_TEXT = 8000;
              const MAX_LINKS = 80;

              const rawText = document.body?.innerText ?? "";
              const text =
                rawText.length > MAX_TEXT
                  ? rawText.slice(0, MAX_TEXT) + "\n…[truncated]"
                  : rawText;

              const anchors = document.querySelectorAll("a[href]");
              const links: { text: string; href: string }[] = [];
              const seen = new Set<string>();

              for (let i = 0; i < anchors.length && links.length < MAX_LINKS; i++) {
                const a = anchors[i] as HTMLAnchorElement;
                const href = a.href;
                if (!href || href.startsWith("javascript:")) continue;
                if (seen.has(href)) continue;
                seen.add(href);
                const linkText = (a.innerText || a.getAttribute("aria-label") || "")
                  .trim()
                  .replace(/\s+/g, " ")
                  .slice(0, 120);
                links.push({ text: linkText || href, href });
              }

              return {
                url: location.href,
                title: document.title,
                text,
                links,
              };
            });

            return {
              ...data,
              hopCount: this.state.hopCount,
              maxHops: MAX_HOPS,
            };
          },
        }),
        followLink: tool({
          description:
            "Navigate to a URL (start page or a link from readPage). Counts as one hop (max 5). Automatically saves a screenshot to evidence after each move. Prefer this over navigate.",
          inputSchema: z.object({
            href: z.string().meta({
              description: "Absolute URL to navigate to",
            }),
          }),
          execute: async ({ href }) => {
            if (!this.canHop()) {
              return {
                ok: false as const,
                reason: `max hops reached (${MAX_HOPS}). Stop exploring and report what you found (or that you could not find the answer).`,
                hopCount: this.state.hopCount,
                maxHops: MAX_HOPS,
                evidence: this.state.evidence,
              };
            }

            const page = await this.getPage();
            await page.goto(href, { waitUntil: "domcontentloaded" });

            const screenshotKey = await this.saveScreenshotToR2();
            this.recordHop(screenshotKey);

            return {
              ok: true as const,
              url: page.url(),
              title: await page.title(),
              screenshotKey,
              hopCount: this.state.hopCount,
              maxHops: MAX_HOPS,
              hopsRemaining: MAX_HOPS - this.state.hopCount,
            };
          },
        }),
        screenshot: tool({
          description:
            "Capture the current page to R2 evidence on demand (does not count as a hop).",
          inputSchema: z.object({}),
          execute: async () => {
            const screenshotKey = await this.saveScreenshotToR2();
            this.appendEvidence(screenshotKey);
            return {
              ok: true as const,
              screenshotKey,
              hopCount: this.state.hopCount,
              evidence: this.state.evidence,
            };
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
              const imageNodes = document.querySelectorAll("img");
              const images: Element[] = [];
              for (let i = 0; i < imageNodes.length; i++) images.push(imageNodes[i]);
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
            const checksArray = Array.isArray(checks) ? checks : Array.from(checks as any);
            const passCount = checksArray.filter((c: any) => c.pass).length;
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

    // Proxy R2 objects for screenshots / exploration evidence
    // pathname "/evidence/{id}/123.jpg" → R2 key "evidence/{id}/123.jpg"
    if (
      url.pathname.startsWith("/screenshots/") ||
      url.pathname.startsWith("/evidence/")
    ) {
      const key = url.pathname.slice(1);
      const file = await env.FILES.get(key);
      if (file) {
        return new Response(file.body, {
          headers: {
            "Content-Type":
              file.httpMetadata?.contentType ?? "image/jpeg",
            "Cache-Control": "public, max-age=3600",
          },
        });
      }
      return new Response("Not found", { status: 404 });
    }

    return (
      (await routeAgentRequest(request, env)) ??
      new Response(null, { status: 404 })
    );
  },
} satisfies ExportedHandler<Env>;