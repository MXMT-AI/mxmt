import { AgentStatusIcon } from "../agent-status-icon/agent-status-icon";
import { AGENTS, BLOCKS } from "@/components/agents/agents.config";
import type { AgentRunInfo } from "@/components/agents/agents.types";


export function PipelineDiagram({ runs }: { runs: Record<string, AgentRunInfo> }) {
  return (
    <section className="mb-6 rounded-xl border border-(--border) bg-(--surface) p-4 sm:p-5">
      <h2 className="mb-4 text-sm font-semibold text-(--text)">Пайплайн агентів</h2>
      <ol className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {BLOCKS.map((block) => {
          const blockAgents = AGENTS.filter((a) => a.block === block.id);
          return (
            <li key={block.id} data-stage={block.id} className="min-w-0 rounded-lg border border-(--signal-line) border-t-[3px] border-t-(--signal) bg-(--signal-wash) p-3">
              <p className="mb-2 flex items-baseline gap-2 text-xs font-bold text-(--signal-ink)">
                <span className="font-mono tabular-nums">{String(block.id).padStart(2, "0")}</span>
                {block.label}
              </p>
              <ul className="space-y-1.5">
                {blockAgents.map((agent) => {
                  const run = runs[agent.id];
                  const s = run?.isCurrent === false ? "idle" : (run?.status ?? "idle");
                  const status = s === "done" ? "Готово" : s === "running" ? "Працює" : s === "error" ? "Помилка" : "Очікування";
                  return (
                    <li
                      key={agent.id}
                      className="flex min-w-0 items-center gap-2 rounded-md border border-(--border) bg-(--surface) px-2 py-1.5 text-xs font-medium text-(--text)"
                    >
                      <AgentStatusIcon status={s} />
                      <span className="min-w-0 wrap-break-word">{agent.label}</span>
                      <span className="sr-only">{status}</span>
                    </li>
                  );
                })}
              </ul>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
