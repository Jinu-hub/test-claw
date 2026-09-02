import { AIChatAgent } from "@cloudflare/ai-chat";
import { routeAgentRequest } from "agents";
import { convertToModelMessages, isLoopFinished, streamText, tool } from "ai";
import { createWorkersAI } from "workers-ai-provider";
import z from "zod";
import {
  addItemToCart,
  cartTotal,
  createInitialOrderState,
  findMenuItem,
  MENU,
  type OrderState,
} from "./order";

export type { CartItem, MenuItem, OrderState, Store } from "./order";

const SYSTEM_PROMPT = `You are a friendly food ordering concierge for a restaurant with pizza, tacos, and bibimbap.

Workflow:
1. When the user wants to order, call getMenu first to see available items.
2. Call addToCart with the exact menu item name or id before confirming anything was added.
3. Call viewCart to show the current cart and total before discussing delivery or checkout.
4. When you need the user's location for delivery, call getLocation (runs in their browser).
5. After getLocation returns, tell them the nearest store and distance in km.
6. Reply in the user's language. Be concise and helpful.

Rules:
- Never claim an item was added without calling addToCart.
- Never quote a total without calling viewCart.
- Never guess the user's location — call getLocation instead.
- Match menu items using Korean or English names from getMenu.`;

export class FoodConciergeAgent extends AIChatAgent<Env, OrderState> {
  initialState: OrderState = createInitialOrderState();

  async onChatMessage() {
    const workersAi = createWorkersAI({
      binding: this.env.AI,
    });

    const result = streamText({
      model: workersAi("@cf/zai-org/glm-4.7-flash"),
      system: SYSTEM_PROMPT,
      messages: await convertToModelMessages(this.messages),
      tools: {
        getMenu: tool({
          description:
            "Return the full restaurant menu with item ids, names, and prices.",
          inputSchema: z.object({}),
          execute: async () => ({
            items: MENU.map((item) => ({
              id: item.id,
              name: item.nameKo,
              nameEn: item.name,
              price: item.price,
              category: item.category,
            })),
          }),
        }),
        addToCart: tool({
          description:
            "Add a menu item to the customer's cart. Call getMenu first if unsure of item names.",
          inputSchema: z.object({
            item: z
              .string()
              .describe("Menu item id or name in Korean or English"),
            quantity: z
              .number()
              .int()
              .min(1)
              .default(1)
              .describe("How many to add"),
          }),
          execute: async ({ item, quantity }) => {
            const menuItem = findMenuItem(item);
            if (!menuItem) {
              return {
                success: false,
                error: `Menu item not found: ${item}`,
              };
            }

            const cart = addItemToCart(this.state.cart, menuItem, quantity);
            this.setState({ ...this.state, cart });

            return {
              success: true,
              added: {
                name: menuItem.nameKo,
                quantity,
                price: menuItem.price,
              },
              cart,
              total: cartTotal(cart),
            };
          },
        }),
        viewCart: tool({
          description:
            "Show the current cart contents and total price in KRW.",
          inputSchema: z.object({}),
          execute: async () => ({
            cart: this.state.cart,
            total: cartTotal(this.state.cart),
            isEmpty: this.state.cart.length === 0,
          }),
        }),
        getLocation: tool({
          description:
            "Get the user's GPS coordinates from their browser to find the nearest store or delivery location. No server execute — the browser handles permission and location lookup.",
          inputSchema: z.object({}),
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
