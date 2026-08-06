import { AIChatAgent } from "@cloudflare/ai-chat";
import { getAgentByName, routeAgentRequest } from "agents";

export class RAGAgent extends AIChatAgent<Env> {
  async ingestPdf(buffer: ArrayBuffer, fileName: string, fileType: string) {
    const result = await this.env.AI.toMarkdown({
      name: fileName,
      blob: new Blob([buffer], { type: fileType }),
    });
    console.log(result);
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

