import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

const styles = {
  body: "text-sm leading-relaxed",
  lead: "mt-[22px] max-w-[540px] text-[clamp(16px,1.3vw,19px)] leading-[1.55]",
  description: "mt-[9px] text-[15px] leading-[1.6]",
};

type TextProps = ComponentProps<"p"> & { variant: keyof typeof styles };

export function Text({ variant, className, ...props }: TextProps) {
  return <p className={cn("text-[color:var(--ui-muted,var(--muted))]", styles[variant], className)} {...props} />;
}
