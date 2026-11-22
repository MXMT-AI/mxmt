import type { ComponentProps, ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Dialog } from "@/components/ui/dialog/dialog";
import type { AgentSimulation } from "../use-agent-simulation";
import { agentsSimulationDialogMessages as ukrainianCopy } from "@/messages/uk.json";

type SimulationDialogProps<T> = Omit<ComponentProps<typeof Dialog>, "children" | "className"> & {
  simulation: AgentSimulation<T>;
  children: (data: T) => ReactNode;
};

export function SimulationDialog<T>({ simulation, children, ...props }: SimulationDialogProps<T>) {
  return (
    <Dialog {...props} className="max-h-[90vh] max-w-5xl shadow-[0_24px_64px_rgba(0,0,0,.6)] backdrop:bg-black/65">
      <div className="space-y-4 px-6 py-5">
        {simulation.status === "loading" && (
          <div role="status" className="flex items-center justify-center gap-2 py-12 text-sm text-(--muted)">
            <RefreshCw size={14} className="motion-safe:animate-spin" aria-hidden="true" />{ukrainianCopy.розрахунок}</div>
        )}
        {simulation.status === "error" && (
          <div role="alert" className="flex items-start gap-2 rounded-xl border border-accent-danger/20 bg-accent-danger/5 px-4 py-3">
            <AlertTriangle size={13} className="mt-0.5 shrink-0 text-accent-danger" aria-hidden="true" />
            <p className="text-xs text-(--muted)">{simulation.message}</p>
          </div>
        )}
        {simulation.status === "success" && children(simulation.data)}
      </div>
    </Dialog>
  );
}
