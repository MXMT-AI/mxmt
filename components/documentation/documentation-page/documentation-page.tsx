import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { BrandLink } from "@/components/brand-link/brand-link";
import { Heading } from "@/components/ui/heading/heading";
import { Text } from "@/components/ui/text/text";
import { mainContentId, SkipLink } from "@/components/ui/skip-link/skip-link";
import { Link } from "@/i18n/navigation";
import { CsvGuide } from "../csv-guide/csv-guide";
import { SheetsGuide } from "../sheets-guide/sheets-guide";
import { docsCopy } from "./copy";
import { sheetsCopy } from "./sheets-copy";

const sourceTabs = [
  { id: "csv", label: "CSV", href: "/docs" },
  { id: "google-sheets", label: "Google Sheets", href: "/docs?tab=google-sheets" },
] as const;

export async function generateMetadata(): Promise<Metadata> {
  const copy = docsCopy[await getLocale()];
  return { title: `${copy.title} | MXMT Analytics`, description: copy.description };
}

export default async function DocumentationPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string | string[] }>;
}) {
  const [locale, { tab }, t] = await Promise.all([getLocale(), searchParams, getTranslations()]);
  const copy = docsCopy[locale];
  const activeTab = tab === "google-sheets" ? sourceTabs[1] : sourceTabs[0];

  return (
    <>
      <SkipLink />
      <header className="border-b border-(--border) bg-(--surface)">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-5 py-3 sm:px-8">
          <BrandLink variant="documentation" />
        </div>
      </header>

      <main id={mainContentId} tabIndex={-1} className="mx-auto max-w-5xl px-5 pb-14 sm:px-8">
        <div className="py-10 sm:py-14">
          <Link href="/" className="mb-5 inline-flex items-center gap-2 text-sm text-(--focus-ring)">
            <ArrowLeft size={16} aria-hidden="true" />{t("nav_back_home")}
          </Link>
          <Heading as="h1" variant="page" className="text-4xl font-semibold tracking-tight sm:text-5xl">{copy.title}</Heading>
          <Text variant="body" className="mt-3 max-w-2xl text-lg leading-7">{copy.description}</Text>
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
