import type { ReactNode } from "react";
import { panel } from "@/components/ui/panel/panel-styles";

export function OverviewActionCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <article className={panel + " p-5"}>
      <h3 className="font-semibold">{title}</h3>
      {children}
    </article>
  );
}
