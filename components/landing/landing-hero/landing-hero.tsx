import type { CSSProperties } from "react";
import { ArrowDown, ArrowRight } from "lucide-react";
import { Section } from "@/components/ui/section/section";
import { Heading } from "@/components/ui/heading/heading";
import { Text } from "@/components/ui/text/text";
import { Actions } from "@/components/ui/actions/actions";
import { ActionLink } from "@/components/ui/action-link/action-link";
import type { LandingCopy } from "../copy";
import { landingFeatures } from "../landing-features";
import styles from "./landing-hero.module.css";

const signalHeights = [
  13, 17, 15, 21, 18, 24, 26, 22, 17, 28, 31, 32, 26, 34, 39, 45,
  33, 39, 31, 24, 36, 52, 57, 61, 53, 45, 47, 56, 60, 67, 70, 65,
  47, 50, 54, 72, 80, 87, 91, 84, 70, 62, 69, 82, 92, 100, 89, 80,
  86, 76, 69, 72, 66, 55, 49, 52, 41, 32,
];

export function LandingHero({ copy }: { copy: LandingCopy }) {
  return (
    <Section
      className="relative isolate overflow-hidden border-b border-landing-line bg-landing-hero"
      aria-labelledby="hero-heading"
      padded={false}
      background={
        <div className={`pointer-events-none absolute inset-x-0 top-0 bottom-[54px] -z-10 overflow-hidden max-[640px]:bottom-[145px] ${styles.art}`} aria-hidden="true">
          <div className={`absolute inset-[-4%_-4%_21%_11%] grid auto-cols-fr grid-flow-col items-end gap-[clamp(3px,.48vw,8px)] -skew-y-[7deg] max-[640px]:inset-[-3%_-37%_35%_-13%] max-[640px]:gap-[3px] ${styles.signal}`}>
            {signalHeights.map((height, index) => (
              <i key={index} className="h-(--height) rounded-[3px]" style={{ "--height": `${height}%`, "--hue": 185 - index * 1.35 } as CSSProperties} />
            ))}
          </div>
        </div>
      }
    >
      <div className="pt-[clamp(180px,19.5vw,290px)] pb-[clamp(44px,4vw,66px)] max-[640px]:pt-[155px] max-[640px]:pb-9">
        <p className="mb-[18px] flex items-center gap-2.5 font-mono text-xs leading-[1.4] font-medium text-landing-audience before:size-2 before:rounded-full before:bg-landing-mint before:shadow-[0_0_16px_var(--landing-mint-glow)]">{copy.audience}</p>
        <Heading as="h1" variant="hero" id="hero-heading">
          {copy.headline[0]} <span className="block">{copy.headline[1]}</span>
        </Heading>
        <Text variant="lead" className="max-[640px]:mt-[17px]">{copy.description}</Text>
        <Actions>
          <ActionLink href="/register">{copy.register}<ArrowRight size={17} aria-hidden="true" /></ActionLink>
          <ActionLink href="#product" variant="secondary" native>{copy.explore}<ArrowDown size={16} aria-hidden="true" /></ActionLink>
        </Actions>
      </div>
      <nav className="grid grid-cols-5 border-t border-landing-line max-[640px]:flex max-[640px]:flex-wrap max-[640px]:gap-x-5 max-[640px]:py-[7px]" aria-label={copy.product}>
        {landingFeatures.map(({ id, Icon }) => (
          <a key={id} href={`#${id}`} className="flex min-h-[68px] items-center justify-center gap-[9px] text-sm text-landing-muted not-first:border-l not-first:border-landing-line hover:text-landing-mint max-[640px]:min-h-[38px] max-[640px]:text-[13px] max-[640px]:not-first:border-0"><Icon size={19} aria-hidden="true" className="shrink-0 max-[640px]:w-[15px]" />{copy.features[id].title}</a>
        ))}
      </nav>
    </Section>
  );
}
