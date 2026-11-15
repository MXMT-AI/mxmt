import { cn } from "@/lib/utils";
import { agentStatusPresentation } from "../agent-status";
import type { AgentStatus } from "../agents.types";

export function AgentStatusIcon({ status }: { status: AgentStatus }) {
  const { Icon, color } = agentStatusPresentation[status];
  return (
    <Icon
      size={12}
      className={cn("shrink-0", color, status === "running" && "motion-safe:animate-spin")}
      aria-hidden="true"
    />
  );
}
