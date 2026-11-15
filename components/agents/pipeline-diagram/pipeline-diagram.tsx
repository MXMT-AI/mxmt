import { useId } from "react";
import { Heading } from "@/components/ui/heading/heading";
import { AgentStatusIcon } from "../agent-status-icon/agent-status-icon";
import { agentStatusPresentation, getAgentRunState } from "../agent-status";
import { AGENT_BLOCKS } from "@/components/agents/agents.config";
import type { AgentRunInfo } from "@/components/agents/agents.types";

export function PipelineDiagram({ runs }: { runs: Record<string, AgentRunInfo> }) {
  const headingId = useId();

  return (
    <section aria-labelledby={headingId} className="mb-6 rounded-xl border border-(--border) bg-(--surface) p-4 sm:p-5">
      <Heading as="h2" variant="compact" id={headingId} className="mb-4">Пайплайн агентів</Heading>
      <ol className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {AGENT_BLOCKS.map((block) => (
          <li key={block.id} data-stage={block.id} className="min-w-0 rounded-lg border border-(--signal-line) border-t-[3px] border-t-(--signal) bg-(--signal-wash) p-3">
            <p className="mb-2 flex items-baseline gap-2 text-xs font-bold text-(--signal-ink)">
              <span className="font-mono tabular-nums">{String(block.id).padStart(2, "0")}</span>
              {block.label}
            </p>
            <ul className="space-y-1.5">
              {block.agents.map((agent) => {
                const { status } = getAgentRunState(runs[agent.id]);
                return (
                  <li
                    key={agent.id}
                    className="flex min-w-0 items-center gap-2 rounded-md border border-(--border) bg-(--surface) px-2 py-1.5 text-xs font-medium text-(--text)"
                  >
                    <AgentStatusIcon status={status} />
                    <span className="min-w-0 wrap-break-word">{agent.label}</span>
                    <span className="sr-only">{agentStatusPresentation[status].label}</span>
                  </li>
                );
              })}
            </ul>
          </li>
        ))}
      </ol>
    </section>
  );
}
