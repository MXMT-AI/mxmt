import { Section } from "@/components/ui/section/section";
import { Heading } from "@/components/ui/heading/heading";
import { Actions } from "@/components/ui/actions/actions";
import { ActionLink } from "@/components/ui/action-link/action-link";
import { RegisterLink } from "@/components/register-link/register-link";
import type { LandingCopy } from "../copy";

export function ClosingSection({ copy }: { copy: LandingCopy }) {
  return (
    <Section aria-labelledby="closing-heading" className="border-y border-landing-line [background:var(--landing-closing)]">
      <Heading as="h2" variant="section" id="closing-heading">{copy.closing}</Heading>
      <Actions>
        <RegisterLink label={copy.register} withArrow />
        <ActionLink href="/login" variant="secondary">{copy.login}</ActionLink>
      </Actions>
    </Section>
  );
}
