import type { Metadata } from "next";
import { ArrowLeft, ArrowUpRight, Download } from "lucide-react";
import { getLocale } from "next-intl/server";
import { BrandMark } from "@/components/BrandMark";
import { ThemeToggle } from "@/components/ThemeProvider";
import { getPathname, Link } from "@/i18n/navigation";
import { docsCopy } from "./copy";
import { sheetsColumns, sheetsCopy, demoSheetUrl } from "./sheets-copy";

const files = ["products.csv", "stock.csv", "orders.csv"];
const sourceTabs = [
  { id: "csv", label: "CSV", href: "/docs" },
  { id: "google-sheets", label: "Google Sheets", href: "/docs?tab=google-sheets" },
] as const;
const sectionStyle = "scroll-mt-6 border-t border-(--border) py-8 sm:py-10";
const titleStyle = "mb-4 text-2xl font-semibold tracking-tight";
const listStyle = "list-decimal space-y-3 pl-6 leading-relaxed text-(--muted)";

export async function generateMetadata(): Promise<Metadata> {
  const copy = docsCopy[await getLocale()];
  return { title: `${copy.title} | MXMT Analytics`, description: copy.description };
}

export default async function DocumentationPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string | string[] }>;
}) {
  const [locale, { tab }] = await Promise.all([getLocale(), searchParams]);
  const copy = docsCopy[locale];
  const alternateLocale = locale === "uk" ? "en" : "uk";
  const activeTab = tab === "google-sheets" ? sourceTabs[1] : sourceTabs[0];
  const alternatePath = getPathname({ href: "/docs", locale: alternateLocale });

  return (
    <>
      <header className="border-b border-(--border) bg-(--surface)">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-5 py-3 sm:px-8">
          <Link href="/" className="inline-flex items-center gap-2 rounded-md text-sm font-semibold">
            <BrandMark transparent />
            MXMT Analytics
          </Link>
          <div className="flex flex-wrap items-center gap-3">
            <a href={activeTab.id === "google-sheets" ? `${alternatePath}?tab=google-sheets` : alternatePath} hrefLang={alternateLocale} lang={alternateLocale} className="text-sm text-(--muted) hover:text-(--text)">
              {copy.language}
            </a>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-5 pb-14 sm:px-8">
        <div className="py-10 sm:py-14">
          <Link href="/" className="mb-5 inline-flex items-center gap-2 text-sm text-(--focus-ring)">
            <ArrowLeft size={16} aria-hidden="true" />{copy.home}
          </Link>
          <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">{copy.title}</h1>
          <p className="mt-3 max-w-2xl text-lg text-(--muted)">{copy.description}</p>
          <nav aria-label={copy.sources} className="mt-7 grid grid-cols-2 divide-x divide-(--border) border border-(--border)">
            {sourceTabs.map((source) => (
              <Link
                key={source.id}
                href={source.href}
                aria-current={source === activeTab ? "page" : undefined}
                className={`relative flex min-h-16 items-center justify-center px-3 text-center font-semibold hover:bg-(--input-hover) ${
                  source === activeTab ? "bg-(--surface) text-(--focus-ring) shadow-[inset_0_-2px_var(--focus-ring)]" : "text-(--text)"
                }`}
              >
                {source.label}
              </Link>
            ))}
          </nav>
        </div>
        {activeTab.id === "csv" ? <CsvGuide copy={copy} /> : <SheetsGuide copy={sheetsCopy[locale]} />}
      </main>
    </>
  );
}

function CsvGuide({ copy }: { copy: (typeof docsCopy)[keyof typeof docsCopy] }) {
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

function SheetsGuide({ copy }: { copy: (typeof sheetsCopy)[keyof typeof sheetsCopy] }) {
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
