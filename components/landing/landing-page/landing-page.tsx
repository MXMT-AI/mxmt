import type { Metadata } from "next";
import { ArrowRight } from "lucide-react";
import { getLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { landingCopy, landingFeatures } from "@/components/landing/copy";
import { ProductGridSection } from "../product-grid-section/product-grid-section";
import { LandingBrand } from "../landing-brand/landing-brand";
import { LandingHeader } from "../landing-header/landing-header";
import { LandingHero } from "../landing-hero/landing-hero";
import { primary, secondary, lede, landingIcons, landingContainer, landingDescription, landingHeading, landingSection, landingSubheading } from "../landing-styles";


const sources = ["Google Sheets", "SalesDrive", "KeyCRM", "Horoshop", "Shopify", "CSV"];
export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const copy = landingCopy[locale];
  return {
    title: `MXMT Analytics | ${copy.audience}`,
    description: copy.description,
  };
}

export default async function Home() {
  const locale = await getLocale();
  const copy = landingCopy[locale];

  return (
    <div className="min-h-svh bg-landing-canvas text-landing-ink font-[family-name:Geist,system-ui,sans-serif] [color-scheme:dark] [.light_&]:[color-scheme:light] [&_a:focus-visible]:outline-landing-mint [&_a:focus-visible]:outline-offset-4 [&_summary:focus-visible]:outline-landing-mint [&_summary:focus-visible]:outline-offset-4">
      <a className="fixed top-2 left-2 z-10 -translate-y-[150%] bg-landing-mint px-3.5 py-2.5 text-landing-canvas focus:translate-y-0" href="#main-content">{copy.skip}</a>
      <LandingHeader locale={locale} />

      <main id="main-content">
        <LandingHero copy={copy} />

        <ProductGridSection>
          <h2 id="product-heading" className={landingHeading}>{copy.productHeading}</h2>
          <div className="mt-9 grid grid-cols-6 gap-px border border-landing-line max-[640px]:grid-cols-1">
            {landingFeatures.map((feature) => {
              const Icon = landingIcons[feature];
              return (
                <article id={feature} key={feature} className="col-span-2 scroll-mt-5 bg-landing-panel/[.84] p-[clamp(20px,3vw,34px)] outline outline-landing-line nth-[n+4]:col-span-3 target:shadow-[inset_0_0_0_1px_var(--landing-mint)] max-[640px]:col-auto max-[640px]:nth-[n+4]:col-auto">
                  <Icon aria-hidden="true" size={23} className="mb-8 text-landing-mint max-[640px]:mb-[18px]" />
                  <h3 className={landingSubheading}>{copy.features[feature].title}</h3>
                  <p className={landingDescription}>{copy.features[feature].description}</p>
                </article>
              );
            })}
          </div>
        </ProductGridSection>

        <section id="workflow" className="border-y border-landing-line bg-landing-workflow">
          <div className={`${landingContainer} ${landingSection}`}>
            <h2 className={landingHeading}>{copy.workflowHeading}</h2>
            <ol className="mt-[38px] grid grid-cols-3 gap-[clamp(18px,4vw,60px)] max-[640px]:grid-cols-1">
              {copy.steps.map((step, index) => (
                <li key={step.title} className="border-t border-landing-line pt-[21px]">
                  <span aria-hidden="true" className="mb-4 block font-mono text-xs leading-none font-medium text-landing-mint">{String(index + 1).padStart(2, "0")}</span>
                  <h3 className={landingSubheading}>{step.title}</h3>
                  <p className={landingDescription}>{step.description}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section id="integrations" className={`${landingContainer} ${landingSection} grid grid-cols-[1.15fr_1fr] items-center gap-[45px] max-[640px]:grid-cols-1 max-[640px]:gap-[26px]`}>
          <div>
            <h2 className={landingHeading}>{copy.integrationsHeading}</h2>
            <p className={lede}>{copy.integrationsDescription}</p>
          </div>
          <ul className="grid grid-cols-2 border-t border-l border-landing-line">
            {sources.map((source) => <li key={source} className="grid min-h-[66px] place-items-center border-r border-b border-landing-line p-2 text-center font-[550]">{source}</li>)}
          </ul>
        </section>

        <section className="border-y border-landing-line [background:var(--landing-closing)]">
          <div className={`${landingContainer} ${landingSection}`}>
            <h2 className={landingHeading}>{copy.closing}</h2>
            <div className="mt-7 flex flex-wrap gap-3 max-[640px]:mt-[22px]">
              <Link href="/register" className={primary}>{copy.register}<ArrowRight size={17} aria-hidden="true" /></Link>
              <Link href="/login" className={secondary}>{copy.login}</Link>
            </div>
          </div>
        </section>
      </main>

      <footer className={`${landingContainer} flex min-h-[92px] flex-wrap items-center justify-between gap-5 py-4`}>
        <LandingBrand />
        <Link href="/login" className="flex items-center gap-2 text-sm text-landing-muted hover:text-landing-mint">{copy.login}<ArrowRight size={15} aria-hidden="true" /></Link>
      </footer>
    </div>
  );
}
