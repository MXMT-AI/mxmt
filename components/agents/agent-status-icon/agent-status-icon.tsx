import { RefreshCw, AlertTriangle, CheckCircle2, Clock } from "lucide-react";
import type { AgentStatus } from "@/components/agents/agents.types";

export function AgentStatusIcon({ status }: { status: AgentStatus }) {
  if (status === "running") return <RefreshCw size={12} className="shrink-0 motion-safe:animate-spin text-accent-yellow" aria-hidden="true" />;
  if (status === "done") return <CheckCircle2 size={12} className="shrink-0 text-accent-cyan" aria-hidden="true" />;
  if (status === "error") return <AlertTriangle size={12} className="shrink-0 text-accent-danger" aria-hidden="true" />;
  return <Clock size={12} className="shrink-0 text-(--subtle)" aria-hidden="true" />;
}
