import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

const tones = {
  accent: { panel: "border-accent-purple/20 bg-accent-purple/5", icon: "text-accent-purple", title: "text-accent-purple" },
  warning: { panel: "border-accent-yellow/20 bg-accent-yellow/5", icon: "text-accent-yellow", title: "text-accent-yellow" },
  neutral: { panel: "border-(--muted)/20 bg-(--muted)/5", icon: "text-(--subtle)", title: "text-(--text)" },
};

export function PeriodNotice({ icon: Icon, tone, title, children }: {
  icon: LucideIcon;
  tone: keyof typeof tones;
  title: string;
  children: ReactNode;
}) {
  const colors = tones[tone];
  return (
    <div className={cn("flex items-start gap-2 rounded-lg border px-3 py-2.5", colors.panel)}>
      <Icon size={12} className={cn("mt-0.5 shrink-0", colors.icon)} aria-hidden="true" />
      <p className="text-[11px] leading-relaxed text-(--muted)">
        <span className={cn("font-semibold", colors.title)}>{title}</span>{" "}{children}
      </p>
    </div>
  );
}
