import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import z from "zod";

type Todo = {
  id: string;
  text: string;
  done: boolean;
};

type State = {
  todos: Todo[];
};

export class TodoMcpAgent extends McpAgent<Env, State> {
  server = new McpServer({ name: "todo-mcp", version: "1.0.0" });

  initialState: State = {
    todos: [],
  };

  async init() {
    this.server.registerTool(
      "list-todos",
      {
        title: "List Todos",
        description: "This tool lists the todos in the list of the user",
      },
      () => {
        return {
          content: [
            {
              type: "text",
              text: `${JSON.stringify(this.state.todos)}`,
            },
          ],
        };
      },
    );
    this.server.registerTool(
      "add-todos",
      {
        title: "Add Todo",
        description: "This tool adds a todo to the list of the user",
        inputSchema: z.object({
          text: z
            .string()
            .meta({ description: "The todo the user wants to add" }),
        }),
      },
      ({ text }) => {
        this.setState({
          todos: [
            ...this.state.todos,
            {
              id: crypto.randomUUID(),
              text,
              done: false,
            },
          ],
        });
        return {
          content: [
            {
              type: "text",
              text: `Todo added!`,
            },
          ],
        };
      },
    );
    this.server.registerTool(
      "complete-todo",
      {
        title: "Complete Todo",
        description: "This tool marks a todo as done",
        inputSchema: z.object({
          id: z
            .string()
            .meta({ description: "The id of the todo to mark as done" }),
        }),
      },
      ({ id }) => {
        const exists = this.state.todos.some((t) => t.id === id);
        if (!exists) {
          return {
            content: [
              {
                type: "text",
                text: `No todo with id ${id}.`,
              },
            ],
          };
        }
        this.setState({
          todos: this.state.todos.map((t) =>
            t.id === id ? { ...t, done: true } : t,
          ),
        });
        return {
          content: [
            {
              type: "text",
              text: `Todo completed!`,
            },
          ],
        };
      },
    );
    this.server.registerTool(
      "delete-todo",
      {
        title: "Delete Todo",
        description: "This tool deletes a single todo from the list",
        inputSchema: z.object({
          id: z.string().meta({ description: "The id of the todo to delete" }),
        }),
      },
      ({ id }) => {
        const exists = this.state.todos.some((t) => t.id === id);
        if (!exists) {
          return {
            content: [
              {
                type: "text",
                text: `No todo with id ${id}.`,
              },
            ],
          };
        }
        this.setState({
          todos: this.state.todos.filter((t) => t.id !== id),
        });
        return {
          content: [
            {
              type: "text",
              text: `Todo deleted!`,
            },
          ],
        };
      },
    );
    this.server.registerTool(
      "clear-all",
      {
        title: "Clear All Todos",
        description: "This tool deletes every todo in the list",
      },
      () => {
        const count = this.state.todos.length;
        if (count === 0) {
          return {
            content: [
              {
                type: "text",
                text: `Nothing to clear.`,
              },
            ],
          };
        }
        this.setState({ todos: [] });
        return {
          content: [
            {
              type: "text",
              text: `Deleted ${count} todos.`,
            },
          ],
        };
      },
    );
  }
}

export default TodoMcpAgent.serve("/mcp", { binding: "TodoMcpAgent" });