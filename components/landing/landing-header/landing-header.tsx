import { ArrowRight, Check, ChevronDown, Globe, Menu } from "lucide-react";
import { getPathname, Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { LandingBrand } from "../landing-brand/landing-brand";
import { LandingMenu } from "../landing-menu/landing-menu";
import { LandingThemeSwitch } from "../landing-theme-switch/landing-theme-switch";
import { landingCopy, landingFeatures } from "../copy";
import { landingContainer, landingIcons, primary } from "../landing-styles";
import styles from "./landing-header.module.css";

const languages = { en: "English", uk: "Українська" } as const;
const menuPanel = "absolute rounded-xl border border-landing-line bg-landing-panel shadow-[0_16px_40px_#0009]";

export function LandingHeader({ locale }: { locale: Locale }) {
  const copy = landingCopy[locale];
  const sectionLinks = (
    <>
      <a href="#workflow">{copy.workflow}</a>
      <a href="#integrations">{copy.integrations}</a>
      <Link href="/docs">{copy.documentation}</Link>
    </>
  );
  const authLinks = (
    <>
      <Link href="/login">{copy.login}</Link>
      <Link href="/register" className={primary}>{copy.register}</Link>
    </>
  );

  return (
    <header className="relative z-[2]">
      <a href="#integrations" className={`flex min-h-[35px] items-center justify-center gap-[9px] border-b border-landing-line px-4 py-1.5 text-center text-xs hover:underline underline-offset-[3px] [&_svg]:shrink-0 [&_svg]:text-landing-mint ${styles.announcement}`}>
        {copy.announcement} <ArrowRight aria-hidden="true" size={14} />
      </a>
      <div className="border-b border-landing-line bg-landing-header">
        <div className={`${landingContainer} flex min-h-[65px] items-center gap-[clamp(22px,3vw,54px)] max-[1190px]:gap-2 max-[640px]:min-h-[59px] max-[640px]:gap-0.5`}>
          <LandingBrand />
          <nav className="flex items-center gap-[clamp(17px,2.1vw,30px)] whitespace-nowrap text-sm max-[1190px]:hidden [&>a:hover]:text-landing-mint" aria-label={copy.navigation}>
            <LandingMenu
              summaryClassName="flex min-h-10 cursor-pointer list-none items-center gap-1.5 [&::-webkit-details-marker]:hidden"
              panelClassName={`${menuPanel} top-full -left-3 min-w-[198px] p-2`}
              className="relative [&>summary:hover]:text-landing-mint [&>summary_svg]:text-landing-muted [&[open]>summary_svg]:rotate-180"
              label={<>{copy.product} <ChevronDown aria-hidden="true" size={14} /></>}
            >
              {landingFeatures.map((feature) => {
                const Icon = landingIcons[feature];
                return <a key={feature} href={`#${feature}`} className="flex items-center gap-2.5 rounded-md px-3 py-2.5 hover:bg-landing-hover-surface"><Icon aria-hidden="true" size={16} className="text-landing-mint" />{copy.features[feature].title}</a>;
              })}
            </LandingMenu>
            {sectionLinks}
          </nav>
          <div className="ml-auto flex items-center gap-2 whitespace-nowrap text-sm max-[640px]:gap-0.5">
            <LandingMenu
              className="relative max-[1190px]:static"
              summaryClassName="grid size-10 cursor-pointer list-none [&::-webkit-details-marker]:hidden place-items-center rounded-full border border-transparent text-landing-muted hover:border-landing-line hover:bg-landing-hover-surface hover:text-landing-mint [[open]>&]:border-landing-line [[open]>&]:bg-landing-hover-surface [[open]>&]:text-landing-mint max-[640px]:w-9"
              panelClassName="absolute top-[calc(100%_+_8px)] right-0 z-1 w-48 rounded-[14px] border border-landing-line bg-landing-panel p-2 shadow-[0_12px_32px_#0003] max-[1190px]:right-6 max-[640px]:right-[18px]"
              label={<><Globe aria-hidden="true" size={17} /><span className="sr-only">{copy.changeLanguage}</span></>}
            >
              <p className="mb-1 border-b border-landing-line px-2 pt-[3px] pb-2 font-semibold">{copy.language}</p>
              {(["en", "uk"] as const).map((option) => (
                <a
                  key={option}
                  href={getPathname({ href: "/", locale: option })}
                  hrefLang={option}
                  lang={option}
                  aria-current={locale === option ? "page" : undefined}
                  className="flex min-h-10 items-center justify-between rounded-md px-2 text-landing-muted hover:bg-landing-hover-surface hover:text-landing-mint aria-[current=page]:bg-landing-hover-surface aria-[current=page]:font-semibold aria-[current=page]:text-landing-mint"
                >
                  {languages[option]}
                  {locale === option && <Check size={16} aria-hidden="true" />}
                </a>
              ))}
            </LandingMenu>
            <LandingThemeSwitch />
            <div className="ml-2 flex items-center gap-[15px] max-[1190px]:hidden [&>a:first-child:hover]:text-landing-mint [&>a:last-child]:min-h-9 [&>a:last-child]:px-4">{authLinks}</div>
          </div>
          <LandingMenu
            className="hidden max-[1190px]:block"
            summaryClassName="flex min-h-11 w-11 cursor-pointer list-none items-center justify-center [&::-webkit-details-marker]:hidden max-[640px]:w-9"
            panelClassName={`${menuPanel} inset-x-6 top-[calc(100%_+_8px)] max-h-[calc(100dvh_-_112px)] overflow-y-auto p-3.5 max-[640px]:inset-x-[18px]`}
            label={<><Menu aria-hidden="true" size={23} /><span className="sr-only">{copy.menu}</span></>}>
            <nav aria-label={copy.navigation} className="flex flex-col gap-1.5 [&>a]:flex [&>a]:min-h-11 [&>a]:items-center [&>a]:px-2.5 [&>a:hover]:text-landing-mint">
              <a href="#product">{copy.product}</a>
              {sectionLinks}
            </nav>
            <div className="mt-2 flex flex-wrap items-center gap-x-3.5 gap-y-1.5 border-t border-landing-line pt-2 [&>a:first-child]:flex [&>a:first-child]:min-h-11 [&>a:first-child]:items-center [&>a:first-child]:px-2.5 [&>a:first-child:hover]:text-landing-mint [&>a:last-child]:min-h-11 [&>a:last-child]:px-[15px]">{authLinks}</div>
          </LandingMenu>
        </div>
      </div>
    </header>
  );
}
