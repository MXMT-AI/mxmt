import { Section } from "@/components/ui/section/section";
import { Heading } from "@/components/ui/heading/heading";
import { Text } from "@/components/ui/text/text";
import type { LandingCopy } from "../copy";

export function WorkflowSection({ copy }: { copy: LandingCopy }) {
  return (
    <Section id="workflow" aria-labelledby="workflow-heading" className="border-y border-landing-line bg-landing-workflow">
      <Heading as="h2" variant="section" id="workflow-heading">{copy.workflowHeading}</Heading>
      <ol className="mt-[38px] grid grid-cols-3 gap-[clamp(18px,4vw,60px)] max-[640px]:grid-cols-1">
        {copy.steps.map((step, index) => (
          <li key={step.title} className="border-t border-landing-line pt-[21px]">
            <span aria-hidden="true" className="mb-4 block font-mono text-xs leading-none font-medium text-landing-mint">{String(index + 1).padStart(2, "0")}</span>
            <Heading as="h3" variant="item">{step.title}</Heading>
            <Text variant="description">{step.description}</Text>
          </li>
        ))}
      </ol>
    </Section>
  );
}
