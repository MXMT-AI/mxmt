import { ArrowDownUp, BarChart3, Boxes, LayoutDashboard, PackagePlus } from "lucide-react";

export const landingIcons = {
  overview: LayoutDashboard,
  sales: BarChart3,
  stock: Boxes,
  repricing: ArrowDownUp,
  reordering: PackagePlus,
};

export const landingContainer = "mx-auto w-[min(100%_-_80px,1320px)] max-[1190px]:w-[calc(100%_-_48px)] max-[640px]:w-[calc(100%_-_36px)]";
export const landingSection = "py-[clamp(55px,8vw,112px)]";
export const landingHeading = "max-w-[830px] text-[clamp(32px,4vw,56px)] leading-[1.08] font-[480] tracking-[-.05em]";
export const landingSubheading = "text-[19px] font-[570] tracking-[-.025em]";
export const landingDescription = "mt-[9px] text-[15px] leading-[1.6] text-landing-muted";

export const primary = "inline-flex min-h-[46px] items-center justify-center gap-[9px] rounded-full border border-transparent bg-landing-ink px-5 text-sm font-[580] text-landing-canvas hover:bg-landing-primary-hover";
export const secondary = "inline-flex min-h-[46px] items-center justify-center gap-[9px] rounded-full border border-landing-control-border bg-landing-hero/[.52] px-5 text-sm font-[580] hover:border-landing-mint hover:text-landing-mint";
export const lede = "mt-[22px] max-w-[540px] text-[clamp(16px,1.3vw,19px)] leading-[1.55] text-landing-muted";
