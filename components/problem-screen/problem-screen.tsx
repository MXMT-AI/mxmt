import { ArrowLeft, ArrowRight, RotateCcw } from "lucide-react";
import type { CSSProperties } from "react";
import type { Locale } from "@/i18n/routing";
import { BrandMark } from "../brand-mark/brand-mark";
import styles from "./problem-screen.module.css";

const container = "mx-auto w-[min(100%_-_64px,1200px)] max-[750px]:w-[calc(100%_-_36px)]";
const action = "inline-flex min-h-[46px] items-center gap-2 rounded-full px-[17px] text-sm font-[620]";
const primary = "cursor-pointer bg-(--problem-accent) text-(--problem-background) hover:brightness-[.92]";
const secondary = "border border-(--problem-line) hover:text-(--problem-accent)";

const copy = {
  uk: {
    "404": { title: "Сторінку не знайдено", description: "Можливо, її перемістили або в адресі є помилка." },
    "500": { title: "Щось пішло не так", description: "Не вдалося завантажити сторінку. Спробуйте ще раз." },
    home: "На головну",
    docs: "Документація",
    retry: "Спробувати ще раз",
  },
  en: {
    "404": { title: "Page not found", description: "The page may have moved, or there may be a typo in the address." },
    "500": { title: "Something went wrong", description: "The page could not be loaded. Please try again." },
    home: "Back to home",
    docs: "Documentation",
    retry: "Try again",
  },
};
const heights = [15, 24, 21, 34, 28, 42, 48, 40, 60, 55, 75, 69, 86, 80, 96, 89];

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
  const labels = copy[locale];
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
        <div className={`relative isolate grid min-h-[clamp(220px,35vw,455px)] min-w-0 items-center overflow-hidden border border-(--problem-line) ${styles.art}`} data-code={code} aria-hidden="true">
          <div className={`absolute inset-[9%_8%_12%] -skew-y-[9deg] border-b border-(--problem-line) ${styles.chart}`}>
            <div className={`grid h-full grid-cols-[repeat(16,minmax(0,1fr))] items-end gap-[clamp(3px,.8vw,11px)] px-[3%] ${styles.bars}`}>
              {heights.map((height, index) => (
                <i key={index} className="h-(--height) border border-(--problem-accent)" style={{ "--height": `${height}%` } as CSSProperties} />
              ))}
            </div>
          </div>
          <span className={`me-[.14em] justify-self-center font-mono text-[clamp(94px,16vw,250px)] leading-[.9] font-bold tracking-[-.14em] text-(--problem-ink) max-[750px]:text-[clamp(86px,23vw,156px)] ${styles.artCode}`}>{code}</span>
        </div>
      </Content>
    </div>
  );
}
