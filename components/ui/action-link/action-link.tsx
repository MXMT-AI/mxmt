import type { ComponentProps } from "react";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

const styles = {
  primary: "border-transparent bg-[color:var(--ui-action-primary-bg,var(--action-bg))] text-[color:var(--ui-action-primary-ink,var(--action-ink))] hover:bg-[color:var(--ui-action-primary-hover,var(--action-hover))]",
  secondary: "border-[color:var(--ui-action-secondary-border,var(--border))] bg-[color:var(--ui-action-secondary-bg,transparent)] hover:border-[color:var(--ui-accent,var(--accent))] hover:text-[color:var(--ui-accent,var(--accent))]",
};

type ActionStyleProps = {
  variant?: keyof typeof styles;
};

type ActionLinkProps = ActionStyleProps & (
  | (Omit<ComponentProps<"a">, "href"> & { href: `#${string}`; native: true })
  | (ComponentProps<typeof Link> & { native?: false })
);

export function ActionLink({ variant = "primary", className, ...props }: ActionLinkProps) {
  const classes = cn(
    "inline-flex min-h-[46px] items-center justify-center gap-[9px] rounded-full border px-5 text-sm font-[580]",
    styles[variant],
    className,
  );

  if (props.native) {
    const { native: _native, ...anchorProps } = props;
    return <a className={classes} {...anchorProps} />;
  }

  const { native: _native, ...linkProps } = props;
  return <Link className={classes} {...linkProps} />;
}
