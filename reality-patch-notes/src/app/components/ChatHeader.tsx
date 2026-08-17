import {
  Badge,
  Button,
  Switch,
  Text
} from "@cloudflare/kumo";
import {
  TrashIcon,
  ChatCircleDotsIcon,
  CircleIcon,
  BugIcon
} from "@phosphor-icons/react";
import { featureFlags } from "../../feature-flags";
import { McpPanel } from "../../starter";
import type { MCPServersState } from "agents";
import { ThemeToggle } from "../../components/ThemeToggle";
import type { ChatAgent } from "../../server";
import type { useAgent } from "agents/react";

type AgentStub = ReturnType<
  typeof useAgent<ChatAgent>
>["stub"];

export function ChatHeader({
  connected,
  showDebug,
  onShowDebugChange,
  onClearHistory,
  mcpState,
  agentStub
}: {
  connected: boolean;
  showDebug: boolean;
  onShowDebugChange: (value: boolean) => void;
  onClearHistory: () => void;
  mcpState: MCPServersState;
  agentStub: AgentStub;
}) {
  return (
    <header className="px-5 py-4 bg-kumo-base border-b border-kumo-line">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold text-kumo-default">
            <span className="mr-2">⛅</span>Reality Patch Notes
          </h1>
          <Badge variant="secondary">
            <ChatCircleDotsIcon size={12} weight="bold" className="mr-1" />
            Phase 8
          </Badge>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <CircleIcon
              size={8}
              weight="fill"
              className={connected ? "text-kumo-success" : "text-kumo-danger"}
            />
            <Text size="xs" variant="secondary">
              {connected ? "Connected" : "Disconnected"}
            </Text>
          </div>
          <div className="flex items-center gap-1.5">
            <BugIcon size={14} className="text-kumo-inactive" />
            <Switch
              checked={showDebug}
              onCheckedChange={onShowDebugChange}
              size="sm"
              aria-label="Toggle debug mode"
            />
          </div>
          <ThemeToggle />
          {featureFlags.mcp && (
            <McpPanel
              mcpState={mcpState}
              onAddServer={(name, url) => agentStub.addServer(name, url)}
              onRemoveServer={(id) => agentStub.removeServer(id)}
            />
          )}
          <Button
            variant="secondary"
            icon={<TrashIcon size={16} />}
            onClick={onClearHistory}
          >
            Clear
          </Button>
        </div>
      </div>
    </header>
  );
}
