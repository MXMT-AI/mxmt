import { Heading } from "@/components/ui/heading/heading";
import { Text } from "@/components/ui/text/text";

type GuideStep = string | { title: string; text: string };

export function GuideSteps({ steps }: { steps: readonly GuideStep[] }) {
  return (
    <ol className="list-decimal space-y-3 pl-6 leading-relaxed text-(--muted)">
      {steps.map((step) => typeof step === "string" ? (
        <li key={step}>{step}</li>
      ) : (
        <li key={step.title}>
          <Heading as="h3" variant="compact" className="text-base leading-relaxed">{step.title}</Heading>
          <Text variant="body" className="text-base">{step.text}</Text>
        </li>
      ))}
    </ol>
  );
}
