import { AIChatAgent } from "@cloudflare/ai-chat";
import { getAgentByName, routeAgentRequest } from "agents";
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

export class RAGAgent extends AIChatAgent<Env> {
  onStart() {
    void this
      .sql`CREATE TABLE IF NOT EXISTS chunks (id TEXT PRIMARY KEY, source TEXT NOT NULL, text TEXT NOT NULL);`;
  }

  embedder() {
    return createWorkersAI({ binding: this.env.AI }).textEmbeddingModel(
      "@cf/baai/bge-base-en-v1.5",
    );
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
      system:
        "You answer questions using ingested documents. Use `recall` to look up information before answering questions about ingested content.",
      messages: await convertToModelMessages(this.messages),
      tools: {
        recall: tool({
          description:
            "Search ingested documents for chunks relevant to a query. Call this before answering questions about previously-saved content.",
          inputSchema: z.object({
            query: z.string().meta({ description: "What to look up." }),
          }),
          execute: async ({ query }) => {
            const { embedding } = await embed({
              model: this.embedder(),
              value: query,
            });
            const { matches } = await this.env.VECTORIZE.query(embedding, {
              topK: 5,
            });
            return matches.map((match) => {
              const [result] = this
                .sql`SELECT * FROM chunks WHERE id = ${match.id}`;
              return result;
            });
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

