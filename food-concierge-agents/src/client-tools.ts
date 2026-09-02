import { nearestStore } from "../worker/order";

export function handleClientToolCall({
  toolCall,
  addToolOutput,
}: {
  toolCall: { toolCallId: string; toolName: string };
  addToolOutput: (args: { toolCallId: string; output: unknown }) => void;
}) {
  if (toolCall.toolName !== "getLocation") return;

  if (!navigator.geolocation) {
    addToolOutput({
      toolCallId: toolCall.toolCallId,
      output: { error: "Geolocation is not supported in this browser." },
    });
    return;
  }

  navigator.geolocation.getCurrentPosition(
    (position) => {
      const lat = position.coords.latitude;
      const lng = position.coords.longitude;
      const nearest = nearestStore(lat, lng);

      addToolOutput({
        toolCallId: toolCall.toolCallId,
        output: {
          lat,
          lng,
          nearestStore: nearest.store.name,
          storeId: nearest.store.id,
          distanceKm: nearest.distanceKm,
        },
      });
    },
    (error) => {
      addToolOutput({
        toolCallId: toolCall.toolCallId,
        output: { error: error.message },
      });
    },
    { enableHighAccuracy: true, timeout: 15_000 },
  );
}
