import { AlertTriangle, CheckCircle2, Clock, RefreshCw, type LucideIcon } from "lucide-react";
import type { AgentRunInfo, AgentStatus } from "./agents.types";

export const agentStatusPresentation = {
  idle: { Icon: Clock, label: "очікування", color: "text-(--subtle)" },
  running: { Icon: RefreshCw, label: "працює", color: "text-accent-yellow" },
  done: { Icon: CheckCircle2, label: "готово", color: "text-accent-cyan" },
  error: { Icon: AlertTriangle, label: "помилка", color: "text-accent-danger" },
} satisfies Record<AgentStatus, { Icon: LucideIcon; label: string; color: string }>;

export function getAgentRunState(run?: Pick<AgentRunInfo, "isCurrent" | "status">) {
  const isStale = run?.isCurrent === false;
  const status = run?.status ?? "idle";
  return {
    status: isStale || !Object.hasOwn(agentStatusPresentation, status) ? "idle" as const : status,
    isStale,
  };
}
