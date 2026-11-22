import { ArrowRight, ChevronDown, Menu } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { LanguageMenu } from "@/components/language-provider/language-menu/language-menu";
import { BrandLink } from "@/components/brand-link/brand-link";
import { Container } from "@/components/ui/container/container";
import { DisclosureMenu } from "@/components/ui/disclosure-menu/disclosure-menu";
import { RegisterLink } from "@/components/register-link/register-link";
import { LandingThemeSwitch } from "../landing-theme-switch/landing-theme-switch";
import { landingCopy } from "../copy";
import { FeatureLinks } from "../feature-links/feature-links";
import styles from "./landing-header.module.css";

const menuPanel = "rounded-xl shadow-[0_16px_40px_#0009]";

export function LandingHeader({ locale }: { locale: Locale }) {
  const t = useTranslations();
  const copy = landingCopy[locale];
  const sectionLinks = (
    <>
      <a href="#workflow">{copy.workflow}</a>
      <a href="#agents">{copy.agents.nav}</a>
      <a href="#integrations">{copy.integrations}</a>
      <Link href="/docs">{t("nav_documentation")}</Link>
    </>
  );
  const authLinks = (
    <>
      <Link href="/login">{copy.login}</Link>
      <RegisterLink label={copy.register} />
    </>
  );

  return (
    <header className="relative z-[2]">
      <a href="#integrations" className={`flex min-h-[35px] items-center justify-center gap-[9px] border-b border-landing-line px-4 py-1.5 text-center text-xs hover:underline underline-offset-[3px] [&_svg]:shrink-0 [&_svg]:text-landing-mint ${styles.announcement}`}>
        {copy.announcement} <ArrowRight aria-hidden="true" size={14} />
      </a>
      <div className="border-b border-landing-line bg-landing-header">
        <Container className="flex min-h-[65px] items-center gap-[clamp(22px,3vw,54px)] max-[1190px]:gap-2 max-[640px]:min-h-[59px] max-[640px]:gap-0.5">
          <BrandLink variant="landing" />
          <nav className="flex items-center gap-[clamp(17px,2.1vw,30px)] whitespace-nowrap text-sm max-[1190px]:hidden [&>a:hover]:text-landing-mint" aria-label={copy.navigation}>
            <DisclosureMenu
              summaryClassName="flex min-h-10 items-center gap-1.5"
              panelClassName={`${menuPanel} top-full -left-3 min-w-[198px] p-2`}
              className="relative [&>summary:hover]:text-landing-mint [&>summary_svg]:text-landing-muted [&[open]>summary_svg]:rotate-180"
              label={<>{copy.product} <ChevronDown aria-hidden="true" size={14} /></>}
            >
              <FeatureLinks copy={copy} variant="menu" />
            </DisclosureMenu>
            {sectionLinks}
          </nav>
          <div className="ml-auto flex items-center gap-2 whitespace-nowrap text-sm max-[640px]:gap-0.5">
            <LanguageMenu label={copy.changeLanguage} title={copy.language} />
            <LandingThemeSwitch />
            <div className="ml-2 flex items-center gap-[15px] max-[1190px]:hidden [&>a:first-child:hover]:text-landing-mint [&>a:last-child]:min-h-9 [&>a:last-child]:px-4">{authLinks}</div>
          </div>
          <DisclosureMenu
            className="hidden max-[1190px]:block"
            summaryClassName="flex min-h-11 w-11 items-center justify-center max-[640px]:w-9"
            panelClassName={`${menuPanel} inset-x-6 top-[calc(100%_+_8px)] max-h-[calc(100dvh_-_112px)] overflow-y-auto p-3.5 max-[640px]:inset-x-[18px]`}
            label={<><Menu aria-hidden="true" size={23} /><span className="sr-only">{copy.menu}</span></>}>
            <nav aria-label={copy.navigation} className="flex flex-col gap-1.5 [&>a]:flex [&>a]:min-h-11 [&>a]:items-center [&>a]:px-2.5 [&>a:hover]:text-landing-mint">
              <a href="#product">{copy.product}</a>
              {sectionLinks}
            </nav>
            <div className="mt-2 flex flex-wrap items-center gap-x-3.5 gap-y-1.5 border-t border-landing-line pt-2 [&>a:first-child]:flex [&>a:first-child]:min-h-11 [&>a:first-child]:items-center [&>a:first-child]:px-2.5 [&>a:first-child:hover]:text-landing-mint [&>a:last-child]:min-h-11 [&>a:last-child]:px-[15px]">{authLinks}</div>
          </DisclosureMenu>
        </Container>
      </div>
    </header>
  );
}
