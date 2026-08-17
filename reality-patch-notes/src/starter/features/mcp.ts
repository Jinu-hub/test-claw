export type McpToolHost = {
  mcp: {
    getAITools(): Record<string, unknown>;
    configureOAuthCallback(options: {
      customHandler: (result: {
        authSuccess: boolean;
        authError?: string;
      }) => Response;
    }): void;
  };
};

export function configureMcpOAuth(agent: McpToolHost) {
  agent.mcp.configureOAuthCallback({
    customHandler: (result) => {
      if (result.authSuccess) {
        return new Response("<script>window.close();</script>", {
          headers: { "content-type": "text/html" },
          status: 200
        });
      }
      return new Response(
        `Authentication Failed: ${result.authError || "Unknown error"}`,
        { headers: { "content-type": "text/plain" }, status: 400 }
      );
    }
  });
}
