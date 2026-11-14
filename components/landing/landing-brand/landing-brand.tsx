import { BrandMark } from "@/components/brand-mark/brand-mark";
import { Link } from "@/i18n/navigation";

export function LandingBrand() {
  return (
    <Link href="/" className="flex shrink-0 items-center gap-[7px] text-[19px] font-bold tracking-[-.045em] [&>:first-child]:mr-[3px]" aria-label="MXMT Analytics">
      <BrandMark transparent />
      MXMT <span className="font-[450] text-landing-muted max-[375px]:hidden">Analytics</span>
    </Link>
  );
}
