import type { Metadata } from "next";
import { getLocale } from "next-intl/server";
import { mainContentId, SkipLink } from "@/components/ui/skip-link/skip-link";
import { landingCopy } from "../copy";
import { LandingHeader } from "../landing-header/landing-header";
import { LandingHero } from "../landing-hero/landing-hero";
import { ProductSection } from "../product-section/product-section";
import { WorkflowSection } from "../workflow-section/workflow-section";
import { IntegrationsSection } from "../integrations-section/integrations-section";
import { ClosingSection } from "../closing-section/closing-section";
import { SiteFooter } from "../site-footer/site-footer";

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
    <div data-ui-theme="landing" className="min-h-svh bg-landing-canvas text-landing-ink font-[family-name:Geist,system-ui,sans-serif] [color-scheme:dark] [.light_&]:[color-scheme:light] [&_a:focus-visible]:outline-landing-mint [&_a:focus-visible]:outline-offset-4 [&_summary:focus-visible]:outline-landing-mint [&_summary:focus-visible]:outline-offset-4">
      <SkipLink />
      <LandingHeader locale={locale} />

      <main id={mainContentId} tabIndex={-1}>
        <LandingHero copy={copy} />

        <ProductSection copy={copy} />

        <WorkflowSection copy={copy} />

        <IntegrationsSection copy={copy} />

        <ClosingSection copy={copy} />
      </main>

      <SiteFooter loginLabel={copy.login} />
    </div>
  );
}
