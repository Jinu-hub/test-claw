import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

type State = {};

export class TodoMcpAgent extends McpAgent<Env, State> {
  server = new McpServer({ name: "todo-mcp", version: "1.0.0" });

  initialState: State = {};

  async init() {}
}

export default TodoMcpAgent.serve("/mcp", { binding: "TodoMcpAgent" });
