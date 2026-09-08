import { AIChatAgent } from "@cloudflare/ai-chat";
import { callable, getAgentByName, routeAgentRequest } from "agents";
import {
  convertToModelMessages,
  embed,
  embedMany,
  isLoopFinished,
  streamText,
  tool,
} from "ai";
import { createWorkersAI } from "workers-ai-provider";
import z from "zod";

/** Target chunk size for Vectorize embeddings (~800 chars). */
export const CHUNK_SIZE = 800;

export type FetchedMarkdown = {
  url: string;
  title: string;
  markdown: string;
};

export class RAGAgent extends AIChatAgent<Env> {
  onStart() {
    void this.sql`
      CREATE TABLE IF NOT EXISTS sources (
        url TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        saved_at TEXT NOT NULL
      )
    `;
    void this
      .sql`CREATE TABLE IF NOT EXISTS chunks (id TEXT PRIMARY KEY, source TEXT NOT NULL, text TEXT NOT NULL);`;
  }

  embedder() {
    return createWorkersAI({ binding: this.env.AI }).textEmbeddingModel(
      "@cf/baai/bge-base-en-v1.5",
    );
  }

  /** Browser Rendering `/markdown` — no custom scraping. */
  async fetchMarkdown(url: string): Promise<FetchedMarkdown> {
    const accountId = this.env.ACCOUNT_ID;
    const apiToken = this.env.API_TOKEN;
    if (
      !accountId ||
      !apiToken ||
      accountId.includes("yyyy") ||
      apiToken.includes("xxxx")
    ) {
      throw new Error(
        "ACCOUNT_ID / API_TOKEN missing. Set them in .dev.vars (local) or via wrangler secret put.",
      );
    }

    const res = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/browser-rendering/markdown`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ url }),
      },
    );

    const data = (await res.json()) as {
      success?: boolean;
      result?: string;
      meta?: { title?: string; finalUrl?: string };
      errors?: { message: string }[];
    };

    if (!res.ok || !data.success || typeof data.result !== "string") {
      const detail =
        data.errors?.map((e) => e.message).join("; ") ||
        `HTTP ${res.status}`;
      throw new Error(`Browser Rendering /markdown failed: ${detail}`);
    }

    const title =
      data.meta?.title?.trim() ||
      titleFromMarkdown(data.result) ||
      new URL(url).hostname;

    return {
      url: data.meta?.finalUrl || url,
      title,
      markdown: data.result,
    };
  }

  /** Split markdown into ~CHUNK_SIZE character pieces, preferring paragraph breaks. */
  chunkText(markdown: string, size = CHUNK_SIZE): string[] {
    const cleaned = markdown.replace(/\r\n/g, "\n").trim();
    if (!cleaned) return [];

    const paragraphs = cleaned.split(/\n{2,}/);
    const chunks: string[] = [];
    let current = "";

    const flush = () => {
      const piece = current.trim();
      if (piece) chunks.push(piece);
      current = "";
    };

    for (const para of paragraphs) {
      const next = current ? `${current}\n\n${para}` : para;
      if (next.length <= size) {
        current = next;
        continue;
      }
      if (current) flush();
      if (para.length <= size) {
        current = para;
        continue;
      }
      for (let i = 0; i < para.length; i += size) {
        chunks.push(para.slice(i, i + size).trim());
      }
    }
    flush();
    return chunks.filter(Boolean);
  }

  /**
   * Phase 1 checkpoint helper — fetch + chunk only (no Vectorize yet).
   * Call from the client with agent.call("debugFetchMarkdown", ["https://example.com"]).
   */
  @callable()
  async debugFetchMarkdown(url: string) {
    const fetched = await this.fetchMarkdown(url);
    const chunks = this.chunkText(fetched.markdown);
    return {
      url: fetched.url,
      title: fetched.title,
      markdownChars: fetched.markdown.length,
      chunkCount: chunks.length,
      chunkSizes: chunks.map((c) => c.length),
      preview: chunks[0]?.slice(0, 200) ?? "",
    };
  }

  /** Remove prior chunks/vectors for a source URL so re-saves stay consistent. */
  async forgetSource(url: string) {
    const rows = this
      .sql<{ id: string }>`SELECT id FROM chunks WHERE source = ${url}`;
    const ids = rows.map((row) => row.id);
    if (ids.length > 0) {
      await this.env.VECTORIZE.deleteByIds(ids);
      void this.sql`DELETE FROM chunks WHERE source = ${url}`;
    }
    void this.sql`DELETE FROM sources WHERE url = ${url}`;
  }

  /**
   * Fetch page markdown, chunk (~800 chars), embed, upsert Vectorize + SQL.
   * Vectors and chunk text share the same id.
   */
  @callable()
  async saveUrl(url: string) {
    const fetched = await this.fetchMarkdown(url);
    const chunks = this.chunkText(fetched.markdown);
    if (chunks.length === 0) {
      throw new Error(`No markdown content extracted from ${url}`);
    }

    // Clear both the requested URL and the final URL (redirects).
    await this.forgetSource(url);
    if (fetched.url !== url) await this.forgetSource(fetched.url);

    const embeddings = await this.embedChunks(chunks);
    const vectors = chunks.map((chunk, index) => {
      const id = crypto.randomUUID();
      void this.sql`
        INSERT INTO chunks (id, source, text)
        VALUES (${id}, ${fetched.url}, ${chunk})
      `;
      return {
        id,
        values: embeddings[index],
        metadata: { source: fetched.url, title: fetched.title },
      };
    });
    await this.env.VECTORIZE.upsert(vectors);

    const savedAt = new Date().toISOString();
    void this.sql`
      INSERT INTO sources (url, title, saved_at)
      VALUES (${fetched.url}, ${fetched.title}, ${savedAt})
    `;

    return {
      url: fetched.url,
      title: fetched.title,
      chunkCount: chunks.length,
      savedAt,
    };
  }

  /** Phase 2 checkpoint — confirm SQL rows after saveUrl. */
  @callable()
  async debugInspectMemory() {
    const sources = this.sql<{
      url: string;
      title: string;
      saved_at: string;
    }>`SELECT url, title, saved_at FROM sources ORDER BY saved_at DESC`;
    const [{ count: chunkCount } = { count: 0 }] = this.sql<{
      count: number;
    }>`SELECT COUNT(*) AS count FROM chunks`;
    return {
      sourceCount: sources.length,
      chunkCount,
      sources,
    };
  }

  /**
   * Embed the question, query Vectorize (topK: 5), then load chunk text from SQL.
   * Each hit includes the source URL for citation.
   */
  @callable()
  async recall(question: string) {
    const { embedding } = await embed({
      model: this.embedder(),
      value: question,
    });
    const { matches } = await this.env.VECTORIZE.query(embedding, {
      topK: 5,
    });

    const chunks = matches.flatMap((match) => {
      const [row] = this.sql<{
        id: string;
        source: string;
        text: string;
      }>`SELECT id, source, text FROM chunks WHERE id = ${match.id}`;
      if (!row) return [];
      return [
        {
          id: row.id,
          sourceUrl: row.source,
          text: row.text,
          score: match.score,
        },
      ];
    });

    return {
      question,
      matchCount: chunks.length,
      chunks,
      sourceUrls: [...new Set(chunks.map((c) => c.sourceUrl))],
    };
  }

  async convert(fileName: string, buffer: ArrayBuffer, fileType: string) {
    const result = await this.env.AI.toMarkdown({
      name: fileName,
      blob: new Blob([buffer], { type: fileType }),
    });
    if (result.format === "error") throw new Error("Could not convert");
    return result.data;
  }

  async embedChunks(chunks: string[]) {
    const { embeddings } = await embedMany({
      model: this.embedder(),
      values: chunks,
    });
    return embeddings;
  }

  async ingestPdf(buffer: ArrayBuffer, fileName: string, fileType: string) {
    const markdown = await this.convert(fileName, buffer, fileType);
    const chunks = markdown.split("\n\n\n");
    console.log(chunks.length);
    const embeddings = await this.embedChunks(chunks);
    const vectors = chunks.map((chunk, index) => {
      const id = crypto.randomUUID();
      void this
        .sql`INSERT INTO chunks (id, source, text) VALUES (${id}, ${fileName}, ${chunk})`;
      return {
        id,
        values: embeddings[index],
        metadata: { source: fileName },
      };
    });
    await this.env.VECTORIZE.upsert(vectors);
  }

  async onChatMessage() {
    const workersAi = createWorkersAI({ binding: this.env.AI });
    const result = streamText({
      model: workersAi("@cf/zai-org/glm-4.7-flash"),
      system: [
        "You are a second-brain assistant that remembers web pages the user saves.",
        "When the user pastes or shares a URL to remember, call `saveUrl` with that URL.",
        "Before answering questions about saved content, call `recall` and base your answer only on the returned chunks.",
        "Always cite the source URL for any fact you use (include the full URL in the answer).",
        'If recall returns no relevant chunks, or the answer is not supported by those chunks, say you do not have a source for that content (e.g. "해당 내용의 출처를 가지고 있지 않다"). Do not invent facts or URLs.',
      ].join(" "),
      messages: await convertToModelMessages(this.messages),
      tools: {
        saveUrl: tool({
          description:
            "Fetch a webpage via Browser Rendering /markdown, chunk it, embed it, and store it in memory (Vectorize + SQL). Call when the user wants to save/remember a URL.",
          inputSchema: z.object({
            url: z
              .string()
              .url()
              .meta({ description: "Absolute http(s) URL to save." }),
          }),
          execute: async ({ url }) => this.saveUrl(url),
        }),
        recall: tool({
          description:
            "Search saved pages for the top 5 chunks relevant to a question. Returns chunk text plus source URL. Call before answering questions about remembered content.",
          inputSchema: z.object({
            question: z
              .string()
              .meta({ description: "The user question to look up." }),
          }),
          execute: async ({ question }) => this.recall(question),
        }),
      },

      stopWhen: isLoopFinished(),
    });

    return result.toUIMessageStreamResponse();
  }
}

function titleFromMarkdown(markdown: string): string | null {
  const heading = markdown.match(/^#\s+(.+)$/m);
  return heading?.[1]?.trim() || null;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/upload") {
      const formData = await request.formData();
      const file = formData.get("file") as File;
      const buffer = await file.arrayBuffer();
      const fileName = `${Date.now()}-${file.name}`;
      await env.FILES.put(fileName, buffer, {
        httpMetadata: {
          contentType: file.type,
        },
      });
      const stub = await getAgentByName(env.RAGAgent, "default");
      await stub.ingestPdf(buffer, fileName, file.type);
      return new Response("ok");
    }
    return (
      (await routeAgentRequest(request, env)) ??
      new Response(null, { status: 404 })
    );
  },
} satisfies ExportedHandler<Env>;

