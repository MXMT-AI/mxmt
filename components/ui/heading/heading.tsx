import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

const styles = {
  compact: "text-sm font-semibold text-(--text)",
  eyebrow: "mb-3 font-mono text-[9px] tracking-widest text-(--subtle) uppercase",
  dialog: "text-base font-bold text-(--text)",
  page: "text-3xl font-bold tracking-tight text-(--text)",
  hero: "max-w-[990px] text-[clamp(42px,5.4vw,81px)] leading-[1.02] font-[480] tracking-[-.048em] max-[640px]:text-[clamp(36px,8.8vw,52px)]",
  section: "max-w-[830px] text-[clamp(32px,4vw,56px)] leading-[1.08] font-[480] tracking-[-.05em]",
  item: "text-[19px] font-[570] tracking-[-.025em]",
};

type HeadingProps = ComponentProps<"h2"> & {
  as: "h1" | "h2" | "h3" | "h4";
  variant: keyof typeof styles;
};

export function Heading({ as: Tag, variant, className, ...props }: HeadingProps) {
  return <Tag className={cn(styles[variant], className)} {...props} />;
}
