import { AlertTriangle, CheckCircle2, Clock, RefreshCw, type LucideIcon } from "lucide-react";
import type { AgentRunInfo, AgentStatus } from "./agents.types";
import { agentsAgentStatusMessages as ukrainianCopy } from "@/messages/uk.json";

export const agentStatusPresentation = {
  idle: { Icon: Clock, label: ukrainianCopy.labelОчікування, color: "text-(--subtle)" },
  running: { Icon: RefreshCw, label: ukrainianCopy.labelПрацює, color: "text-accent-yellow" },
  done: { Icon: CheckCircle2, label: ukrainianCopy.labelГотово, color: "text-accent-cyan" },
  error: { Icon: AlertTriangle, label: ukrainianCopy.labelПомилка, color: "text-accent-danger" },
} satisfies Record<AgentStatus, { Icon: LucideIcon; label: string; color: string }>;

export function getAgentRunState(run?: Pick<AgentRunInfo, "isCurrent" | "status">) {
  const isStale = run?.isCurrent === false;
  const status = run?.status ?? "idle";
  return {
    status: isStale || !Object.hasOwn(agentStatusPresentation, status) ? "idle" as const : status,
    isStale,
  };
}
