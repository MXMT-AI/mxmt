import { Download } from "lucide-react";
import { Link } from "@/i18n/navigation";
import type { docsCopy } from "../documentation-page/copy";
import { sectionStyle, titleStyle, listStyle } from "../guide-styles";

const files = ["products.csv", "stock.csv", "orders.csv"];

export function CsvGuide({ copy }: { copy: (typeof docsCopy)[keyof typeof docsCopy] }) {
  return (
    <>
    <section id="dataset" className={sectionStyle}>
      <h2 className={titleStyle}>{copy.training}</h2>
      <p className="max-w-3xl leading-relaxed text-(--muted)">{copy.trainingIntro}</p>
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
    </section>

    <section id="import" className={sectionStyle}>
      <h2 className={titleStyle}>{copy.importTitle}</h2>
      <ol className={listStyle}>
        {copy.importSteps.map((step) => (
          <li key={step.title}>
            <h3 className="font-semibold text-(--text)">{step.title}</h3>
            <p>{step.text}</p>
          </li>
        ))}
      </ol>
      <div className="mt-5 flex flex-wrap gap-2">
        <Link href="/settings?tab=general#csv-import-title" className="inline-flex min-h-11 items-center rounded-lg border border-(--border) bg-(--surface) px-4 text-sm font-semibold hover:border-(--focus-ring)">
          {copy.settings}
        </Link>
        <Link href="/overview?period=custom&dateFrom=2026-09-01&dateTo=2026-09-30&asOf=2026-09-30" className="inline-flex min-h-11 items-center rounded-lg border border-(--border) bg-(--surface) px-4 text-sm font-semibold hover:border-(--focus-ring)">
          {copy.report}
        </Link>
      </div>
    </section>

    <section id="annual" className={sectionStyle}>
      <h2 className={titleStyle}>{copy.annualTitle}</h2>
      <p className="mb-4 leading-relaxed text-(--muted)">{copy.annualIntro}</p>
      <ol className={listStyle}>{copy.annualSteps.map((step) => <li key={step}>{step}</li>)}</ol>
      <p className="mt-5 rounded-lg border border-(--border) bg-(--surface) p-4 text-sm leading-relaxed text-(--muted)">{copy.annualNote}</p>
    </section>

    <section id="own-csv" className={sectionStyle}>
      <h2 className={titleStyle}>{copy.ownTitle}</h2>
      <ol className={listStyle}>{copy.ownSteps.map((step) => <li key={step}>{step}</li>)}</ol>
    </section>

    <section id="export" className={sectionStyle}>
      <h2 className={titleStyle}>{copy.exportTitle}</h2>
      <ol className={listStyle}>{copy.exportSteps.map((step) => <li key={step}>{step}</li>)}</ol>
    </section>
    </>
  );
}
