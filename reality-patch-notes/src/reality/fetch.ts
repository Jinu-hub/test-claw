export type FetchedSource = {
  url: string;
  title: string;
  publisher: string;
  sourceType: string;
  ok: boolean;
  status?: number;
  text: string;
  error?: string;
};

export function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

export async function fetchSourceText(
  source: {
    url: string;
    title: string;
    publisher: string;
    sourceType: string;
  },
  options?: { maxChars?: number }
): Promise<FetchedSource> {
  const maxChars = options?.maxChars ?? 8000;
  try {
    const response = await fetch(source.url, {
      headers: {
        "user-agent": "RealityPatchNotesBot/0.1 (+phase4-initialize)",
        accept: "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.8"
      },
      redirect: "follow"
    });

    if (!response.ok) {
      return {
        ...source,
        ok: false,
        status: response.status,
        text: "",
        error: `HTTP ${response.status}`
      };
    }

    const contentType = response.headers.get("content-type") ?? "";
    const raw = await response.text();
    const text = (
      contentType.includes("html")
        ? htmlToText(raw)
        : raw.replace(/\s+/g, " ").trim()
    ).slice(0, maxChars);

    return {
      ...source,
      ok: true,
      status: response.status,
      text
    };
  } catch (error) {
    return {
      ...source,
      ok: false,
      text: "",
      error: error instanceof Error ? error.message : String(error)
    };
  }
}
