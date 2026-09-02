import type { TextStreamPart, ToolSet } from "ai";
import { sanitizeStutteredText } from "./game";

/** Buffer streamed text and emit one clean delta to avoid Korean stutter artifacts. */
export function bufferedSanitizeTransform<TOOLS extends ToolSet>() {
  return () => {
    let buffer = "";
    let textId: string | undefined;
    let textStartChunk: TextStreamPart<TOOLS> | undefined;

    return new TransformStream<TextStreamPart<TOOLS>, TextStreamPart<TOOLS>>({
      transform(chunk, controller) {
        if (chunk.type === "text-start") {
          textStartChunk = chunk;
          textId = chunk.id;
          return;
        }

        if (chunk.type === "text-delta") {
          buffer += chunk.text;
          return;
        }

        if (chunk.type === "text-end" && textId) {
          if (textStartChunk) controller.enqueue(textStartChunk);

          const clean = sanitizeStutteredText(buffer);
          if (clean) {
            controller.enqueue({
              type: "text-delta",
              id: textId,
              text: clean,
            });
          }

          controller.enqueue(chunk);
          buffer = "";
          textId = undefined;
          textStartChunk = undefined;
          return;
        }

        controller.enqueue(chunk);
      },
    });
  };
}
