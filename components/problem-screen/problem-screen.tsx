import { ArrowLeft, ArrowRight, RotateCcw } from "lucide-react";
import type { Locale } from "@/i18n/routing";
import { BrandMark } from "../brand-mark/brand-mark";
import { problemScreenCopy } from "./copy";
import { ProblemIllustration } from "./problem-illustration/problem-illustration";

const container = "mx-auto w-[min(100%_-_64px,1200px)] max-[750px]:w-[calc(100%_-_36px)]";
const action = "inline-flex min-h-[46px] items-center gap-2 rounded-full px-[17px] text-sm font-[620]";
const primary = "cursor-pointer bg-(--problem-accent) text-(--problem-background) hover:brightness-[.92]";
const secondary = "border border-(--problem-line) hover:text-(--problem-accent)";

export function ProblemScreen({
  code,
  locale,
  retry,
  embedded = false,
}: {
  code: "404" | "500";
  locale: Locale;
  retry?: () => void;
  embedded?: boolean;
}) {
  const labels = problemScreenCopy[locale];
  const home = `/${locale}`;
  const Heading = embedded ? "h2" : "h1";
  const Content = embedded ? "section" : "main";

  return (
    <div className="min-h-svh bg-(--problem-background) text-(--problem-ink) data-embedded:min-h-[min(80svh,690px)]" data-embedded={embedded || undefined}>
      {!embedded && (
        <header className="border-b border-(--problem-line) [background:radial-gradient(circle_at_100%_0%,var(--problem-glow),transparent_24rem),var(--problem-background)]">
          <div className={`${container} flex min-h-[73px] items-center justify-between gap-4 max-[750px]:min-h-[62px]`}>
            <a href={home} className="inline-flex items-center gap-2 text-[19px] font-bold tracking-[-.035em] max-[360px]:gap-[5px] max-[360px]:text-base">
              <BrandMark transparent /> MXMT <span className="font-[450] text-(--problem-muted)">Analytics</span>
            </a>
            <a className="inline-flex items-center gap-2 text-sm text-(--problem-muted) hover:text-(--problem-accent) max-[360px]:text-xs max-[360px]:[&_svg]:hidden" href={`${home}/docs`}>{labels.docs}<ArrowRight aria-hidden="true" size={16} /></a>
          </div>
        </header>
      )}
      <Content className={`${container} grid grid-cols-[minmax(0,1fr)_minmax(0,1.04fr)] items-center gap-[clamp(20px,5vw,76px)] py-[clamp(58px,10vw,128px)] max-[750px]:grid-cols-1 max-[750px]:gap-[38px] max-[750px]:py-[55px] ${embedded ? "min-h-[min(80svh,690px)]" : "min-h-[min(calc(100svh_-_74px),760px)] max-[750px]:min-h-0"}`} aria-labelledby="problem-title">
        <div>
          <p className="mb-[18px] font-mono text-[15px] leading-none font-semibold text-(--problem-accent) data-[code=500]:text-(--problem-alert)" data-code={code}>{code}</p>
          <Heading id="problem-title" className="text-[clamp(39px,5.1vw,75px)] leading-[1.02] font-[550] tracking-[-.05em]">{labels[code].title}</Heading>
          <p className="mt-6 max-w-md text-[clamp(16px,1.7vw,20px)] leading-normal text-(--problem-muted)">{labels[code].description}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            {retry && (
              <button type="button" className={`${action} ${primary}`} onClick={retry}>
                <RotateCcw size={17} aria-hidden="true" />{labels.retry}
              </button>
            )}
            <a href={home} className={`${action} ${retry ? secondary : primary}`}>
              <ArrowLeft size={17} aria-hidden="true" />{labels.home}
            </a>
          </div>
        </div>
        <ProblemIllustration code={code} />
      </Content>
    </div>
  );
}
