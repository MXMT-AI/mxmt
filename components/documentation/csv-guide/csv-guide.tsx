import { Download } from "lucide-react";
import { ActionLink } from "@/components/ui/action-link/action-link";
import { Text } from "@/components/ui/text/text";
import type { docsCopy } from "../documentation-page/copy";
import { GuideSection } from "../guide-section/guide-section";
import { GuideSteps } from "../guide-steps/guide-steps";

const files = ["products.csv", "stock.csv", "orders.csv"];

export function CsvGuide({ copy }: { copy: (typeof docsCopy)[keyof typeof docsCopy] }) {
  return (
    <>
      <GuideSection id="dataset" title={copy.training}>
        <Text variant="body" className="max-w-3xl text-base">{copy.trainingIntro}</Text>
        <ul className="mt-5 grid gap-2 sm:grid-cols-3">
          {files.map((file, index) => (
            <li key={file}>
              <a href={`/training-data/${file}`} download className="flex min-h-16 items-center gap-3 rounded-lg border border-(--border) bg-(--surface) px-4 py-2.5 hover:border-(--focus-ring)">
                <Download size={18} aria-hidden="true" className="shrink-0 text-(--focus-ring)" />
                <span className="grid gap-0.5 text-sm">
                  {copy.files[index]}
                  <span className="text-xs text-(--muted)">{file}</span>
                </span>
              </a>
            </li>
          ))}
        </ul>
      </GuideSection>

      <GuideSection id="import" title={copy.importTitle}>
        <GuideSteps steps={copy.importSteps} />
        <div className="mt-5 flex flex-wrap gap-2">
          <ActionLink variant="guide" href="/settings?tab=general#csv-import-title">
            {copy.settings}
          </ActionLink>
          <ActionLink variant="guide" href="/overview?period=custom&dateFrom=2026-09-01&dateTo=2026-09-30&asOf=2026-09-30">
            {copy.report}
          </ActionLink>
        </div>
      </GuideSection>

      <GuideSection id="annual" title={copy.annualTitle}>
        <Text variant="body" className="mb-4 text-base">{copy.annualIntro}</Text>
        <GuideSteps steps={copy.annualSteps} />
        <Text variant="body" className="mt-5 rounded-lg border border-(--border) bg-(--surface) p-4">{copy.annualNote}</Text>
      </GuideSection>

      <GuideSection id="own-csv" title={copy.ownTitle}>
        <GuideSteps steps={copy.ownSteps} />
      </GuideSection>

      <GuideSection id="export" title={copy.exportTitle}>
        <GuideSteps steps={copy.exportSteps} />
      </GuideSection>
    </>
  );
}
