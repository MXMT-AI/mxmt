import type { ComponentProps, ReactNode } from "react";
import { ActionLink } from "@/components/ui/action-link/action-link";
import { Heading } from "@/components/ui/heading/heading";
import { Text } from "@/components/ui/text/text";
import { cn } from "@/lib/utils";

const tones = {
  warning: { border: "border-accent-yellow/20", ink: "text-accent-yellow", action: "border-accent-yellow/20 bg-accent-yellow/10 text-accent-yellow hover:border-accent-yellow/20 hover:bg-accent-yellow/20 hover:text-accent-yellow" },
  accent: { border: "border-accent-purple/20", ink: "text-accent-purple", action: "border-accent-purple/20 bg-accent-purple/10 text-accent-purple hover:border-accent-purple/20 hover:bg-accent-purple/20 hover:text-accent-purple" },
  positive: { border: "border-accent-cyan/20", ink: "text-accent-cyan", action: "border-accent-cyan/20 bg-accent-cyan/10 text-accent-cyan hover:border-accent-cyan/20 hover:bg-accent-cyan/20 hover:text-accent-cyan" },
};

export function DashboardSetupCard({ eyebrow, title, children, href, action, tone, stacked = false }: {
  eyebrow: string;
  title: string;
  children: ReactNode;
  href: ComponentProps<typeof ActionLink>["href"];
  action: string;
  tone: keyof typeof tones;
  stacked?: boolean;
}) {
  const style = tones[tone];
  return (
    <section className={cn("rounded-xl border bg-(--surface) p-6", style.border, !stacked && "flex flex-wrap items-start justify-between gap-4")}>
      <div>
        <div className={cn("mb-2 font-mono text-[9px] tracking-widest uppercase", style.ink)}>{eyebrow}</div>
        <Heading as="h2" variant="compact" className="mb-1 text-base">{title}</Heading>
        <Text variant="body" className={cn("leading-5", stacked && "mb-4")}>{children}</Text>
      </div>
      <ActionLink href={href} variant="secondary" className={cn("min-h-0 shrink-0 rounded-lg px-4 py-2 font-medium whitespace-nowrap", style.action)}>
        {action}
      </ActionLink>
    </section>
  );
}
