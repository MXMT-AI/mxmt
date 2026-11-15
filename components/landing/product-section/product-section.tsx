import { Heading } from "@/components/ui/heading/heading";
import { ItemDescription } from "@/components/ui/item-description/item-description";
import type { LandingCopy } from "../copy";
import { landingFeatures } from "../landing-features";
import { ProductGridSection } from "../product-grid-section/product-grid-section";

export function ProductSection({ copy }: { copy: LandingCopy }) {
  return (
    <ProductGridSection>
      <Heading as="h2" variant="section" id="product-heading">{copy.productHeading}</Heading>
      <div className="mt-9 grid grid-cols-6 gap-px border border-landing-line max-[640px]:grid-cols-1">
        {landingFeatures.map(({ id, Icon }) => (
            <article id={id} key={id} className="col-span-2 scroll-mt-5 bg-landing-panel/[.84] p-[clamp(20px,3vw,34px)] outline outline-landing-line nth-[n+4]:col-span-3 target:shadow-[inset_0_0_0_1px_var(--landing-mint)] max-[640px]:col-auto max-[640px]:nth-[n+4]:col-auto">
              <Icon aria-hidden="true" size={23} className="mb-8 text-landing-mint max-[640px]:mb-[18px]" />
              <ItemDescription title={copy.features[id].title} description={copy.features[id].description} />
            </article>
        ))}
      </div>
    </ProductGridSection>
  );
}
