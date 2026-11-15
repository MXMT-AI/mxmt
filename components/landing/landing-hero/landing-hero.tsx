import { ArrowDown } from "lucide-react";
import { RegisterLink } from "@/components/register-link/register-link";
import { Section } from "@/components/ui/section/section";
import { Heading } from "@/components/ui/heading/heading";
import { Text } from "@/components/ui/text/text";
import { Actions } from "@/components/ui/actions/actions";
import { ActionLink } from "@/components/ui/action-link/action-link";
import type { LandingCopy } from "../copy";
import { FeatureLinks } from "../feature-links/feature-links";
import { HeroBackdrop } from "../hero-backdrop/hero-backdrop";

export function LandingHero({ copy }: { copy: LandingCopy }) {
  return (
    <Section
      className="relative isolate overflow-hidden border-b border-landing-line bg-landing-hero"
      aria-labelledby="hero-heading"
      padded={false}
      background={<HeroBackdrop />}
    >
      <div className="pt-[clamp(180px,19.5vw,290px)] pb-[clamp(44px,4vw,66px)] max-[640px]:pt-[155px] max-[640px]:pb-9">
        <p className="mb-[18px] flex items-center gap-2.5 font-mono text-xs leading-[1.4] font-medium text-landing-audience before:size-2 before:rounded-full before:bg-landing-mint before:shadow-[0_0_16px_var(--landing-mint-glow)]">{copy.audience}</p>
        <Heading as="h1" variant="hero" id="hero-heading">
          {copy.headline[0]} <span className="block">{copy.headline[1]}</span>
        </Heading>
        <Text variant="lead" className="max-[640px]:mt-[17px]">{copy.description}</Text>
        <Actions>
          <RegisterLink label={copy.register} withArrow />
          <ActionLink href="#product" variant="secondary" native>{copy.explore}<ArrowDown size={16} aria-hidden="true" /></ActionLink>
        </Actions>
      </div>
      <nav className="grid grid-cols-5 border-t border-landing-line max-[640px]:flex max-[640px]:flex-wrap max-[640px]:gap-x-5 max-[640px]:py-[7px]" aria-label={copy.product}>
        <FeatureLinks copy={copy} variant="row" />
      </nav>
    </Section>
  );
}
