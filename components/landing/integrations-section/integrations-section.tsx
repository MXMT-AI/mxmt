import { Section } from "@/components/ui/section/section";
import { Heading } from "@/components/ui/heading/heading";
import { Text } from "@/components/ui/text/text";
import type { LandingCopy } from "../copy";
import { landingIntegrationsSectionMessages as englishCopy } from "@/messages/en.json";

const sources = [englishCopy.sourcesGoogleSheets, "SalesDrive", "KeyCRM", "Horoshop", "Shopify", "CSV"];

export function IntegrationsSection({ copy }: { copy: LandingCopy }) {
  return (
    <Section id="integrations" aria-labelledby="integrations-heading" contentClassName="grid grid-cols-[1.15fr_1fr] items-center gap-[45px] max-[640px]:grid-cols-1 max-[640px]:gap-[26px]">
      <div>
        <Heading as="h2" variant="section" id="integrations-heading">{copy.integrationsHeading}</Heading>
        <Text variant="lead">{copy.integrationsDescription}</Text>
      </div>
      <ul className="grid grid-cols-2 border-t border-l border-landing-line">
        {sources.map((source) => <li key={source} className="grid min-h-[66px] place-items-center border-r border-b border-landing-line p-2 text-center font-[550]">{source}</li>)}
      </ul>
    </Section>
  );
}
