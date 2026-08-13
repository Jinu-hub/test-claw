import { tool } from "ai";
import { z } from "zod";

export const weatherPrompt = "You can check the weather for a city.";

export function createWeatherTools() {
  return {
    getWeather: tool({
      description: "Get the current weather for a city",
      inputSchema: z.object({
        city: z.string().describe("City name")
      }),
      execute: async ({ city }) => {
        // Replace with a real weather API in production
        const conditions = ["sunny", "cloudy", "rainy", "snowy"];
        const temp = Math.floor(Math.random() * 30) + 5;
        return {
          city,
          temperature: temp,
          condition: conditions[Math.floor(Math.random() * conditions.length)],
          unit: "celsius"
        };
      }
    })
  };
}
