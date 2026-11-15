import { BrandMark } from "@/components/brand-mark/brand-mark";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

const styles = {
  landing: {
    link: "flex shrink-0 text-[19px] [&>:first-child]:mr-[3px]",
    subtitle: "text-landing-muted max-[375px]:hidden",
  },
  auth: {
    link: "inline-flex text-[1.1875rem] max-[480px]:gap-1 max-[480px]:text-base",
    subtitle: "text-(--login-muted)",
  },
  documentation: {
    link: "inline-flex gap-2 rounded-md text-sm font-semibold tracking-normal",
    subtitle: "font-semibold",
  },
};

export function BrandLink({ variant }: { variant: keyof typeof styles }) {
  const style = styles[variant];

  return (
    <Link
      href="/"
      className={cn("items-center gap-[7px] font-bold tracking-[-.045em]", style.link)}
      aria-label="MXMT Analytics"
    >
      <BrandMark transparent />
      MXMT <span className={cn("font-[450]", style.subtitle)}>Analytics</span>
    </Link>
  );
}
