import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

const styles = {
  login: {
    label: "mb-1.5 text-[.8125rem] font-[550] text-(--login-muted)",
    input: "text-base placeholder:text-(--login-muted) focus:border-(--focus-ring) sm:text-sm",
  },
  register: {
    label: "mb-2 font-mono text-[10px] tracking-widest text-(--muted) uppercase",
    input: "text-sm transition-colors placeholder:text-(--subtle) focus:border-accent-cyan/40 focus:outline-hidden",
  },
};

type AuthFieldProps = ComponentProps<"input"> & {
  id: string;
  label: string;
  variant?: keyof typeof styles;
};

export function AuthField({ id, label, variant = "login", className, ...props }: AuthFieldProps) {
  return (
    <div>
      <label htmlFor={id} className={cn("block", styles[variant].label)}>
        {label}
      </label>
      <input
        {...props}
        id={id}
        className={cn(
          "w-full rounded-lg border border-(--border) bg-(--input-bg) px-4 py-2.5 text-(--text)",
          styles[variant].input,
          className,
        )}
      />
    </div>
  );
}
