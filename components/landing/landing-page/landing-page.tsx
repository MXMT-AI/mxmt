import type { Metadata } from "next";
import { ArrowRight } from "lucide-react";
import { getLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Container } from "@/components/ui/container/container";
import { landingCopy } from "../copy";
import { LandingBrand } from "../landing-brand/landing-brand";
import { LandingHeader } from "../landing-header/landing-header";
import { LandingHero } from "../landing-hero/landing-hero";
import { ProductSection } from "../product-section/product-section";
import { WorkflowSection } from "../workflow-section/workflow-section";
import { IntegrationsSection } from "../integrations-section/integrations-section";
import { ClosingSection } from "../closing-section/closing-section";

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
      <a className="fixed top-2 left-2 z-10 -translate-y-[150%] bg-landing-mint px-3.5 py-2.5 text-landing-canvas focus:translate-y-0" href="#main-content">{copy.skip}</a>
      <LandingHeader locale={locale} />

      <main id="main-content">
        <LandingHero copy={copy} />

        <ProductSection copy={copy} />

        <WorkflowSection copy={copy} />

        <IntegrationsSection copy={copy} />

        <ClosingSection copy={copy} />
      </main>

      <footer>
        <Container className="flex min-h-[92px] flex-wrap items-center justify-between gap-5 py-4">
          <LandingBrand />
          <Link href="/login" className="flex items-center gap-2 text-sm text-landing-muted hover:text-landing-mint">{copy.login}<ArrowRight size={15} aria-hidden="true" /></Link>
        </Container>
      </footer>
    </div>
  );
}
