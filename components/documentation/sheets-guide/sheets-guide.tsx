import { ArrowUpRight } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { sheetsColumns, sheetsCopy, demoSheetUrl } from "../documentation-page/sheets-copy";
import { sectionStyle, titleStyle, listStyle } from "../guide-styles";

export function SheetsGuide({ copy }: { copy: (typeof sheetsCopy)[keyof typeof sheetsCopy] }) {
  return (
    <>
      <section id="sheets" className={sectionStyle}>
        <h2 className={titleStyle}>{copy.title}</h2>
        <p className="max-w-3xl leading-relaxed text-(--muted)">{copy.intro}</p>
        <a href={demoSheetUrl} className="mt-4 mb-7 inline-flex min-h-11 items-center gap-2 rounded-lg border border-(--border) bg-(--surface) px-4 text-sm font-semibold text-(--focus-ring) hover:border-(--focus-ring)">
          {copy.open}<ArrowUpRight size={16} aria-hidden="true" />
        </a>
        <ol className={listStyle}>
          {copy.steps.map((step) => (
            <li key={step.title}>
              <h3 className="font-semibold text-(--text)">{step.title}</h3>
              <p>{step.text}</p>
            </li>
          ))}
        </ol>
        <div className="mt-5 flex flex-wrap gap-2">
          {[
            { href: "/settings?tab=general", label: copy.settings },
            { href: "/data-reporting?provider=sheets", label: copy.reporting },
            { href: "/overview?period=custom&dateFrom=2026-10-01&dateTo=2026-10-29&asOf=2026-10-29", label: copy.report },
          ].map(({ href, label }) => (
            <Link key={href} href={href} className="inline-flex min-h-11 items-center rounded-lg border border-(--border) bg-(--surface) px-4 text-sm font-semibold hover:border-(--focus-ring)">
              {label}
            </Link>
          ))}
        </div>
      </section>

      <section id="sheets-mapping" className={sectionStyle}>
        <h2 className={titleStyle}>{copy.mapping}</h2>
        <div className="grid gap-4 lg:grid-cols-2">
          {[
            { name: "Product YML 2.0", rows: sheetsColumns.products },
            { name: "ZAVOD_API", rows: sheetsColumns.orders },
          ].map(({ name, rows }) => (
            <table key={name} className="w-full border-collapse border border-(--border) text-left text-sm">
              <caption className="mb-2 text-left font-semibold">{name}</caption>
              <thead className="bg-(--surface)">
                <tr>
                  <th scope="col" className="px-3 py-2">{copy.field}</th>
                  <th scope="col" className="px-3 py-2">{copy.column}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(([field, columns]) => (
                  <tr key={field} className="border-t border-(--border)">
                    <td className="px-3 py-2 wrap-anywhere">{field}</td>
                    <td className="px-3 py-2 font-mono text-xs">{columns}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ))}
        </div>
        <ul className="mt-5 list-disc space-y-2 pl-6 leading-relaxed text-(--muted)">
          {copy.rules.map((rule) => <li key={rule}>{rule}</li>)}
        </ul>
      </section>
    </>
  );
}
