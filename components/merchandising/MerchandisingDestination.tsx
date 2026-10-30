"use client";
import { Link } from "@/i18n/navigation";
import { useSearchParams } from "next/navigation";
import { useLang } from "@/components/LanguageProvider";
import {
  useMerchandisingOptions,
  useMerchandisingFilters,
} from "./MerchandisingShell";
import { merchandisingCopy } from "@/lib/merchandising-copy";
import {
  merchandisingGroup,
  merchandisingHref,
  type MvpScreen,
} from "@/lib/merchandising-navigation";

/** Shared route boundary for upcoming screen content; navigation does not invent report values. */
export default function MerchandisingDestination({
  screen,
}: {
  screen: MvpScreen;
}) {
  const { lang } = useLang(),
    copy = merchandisingCopy[lang];
  const params = useSearchParams(),
    options = useMerchandisingOptions();
  const query = new URLSearchParams(params);
  // Include resolved dates even before the first Apply, preserving D15 across links.
  const filters = useMerchandisingFilters()!;
  for (const key of ["period", "dateFrom", "dateTo"] as const)
    query.set(key, filters[key]);
  const href = (path: string, detail?: Record<string, string | null>) =>
    merchandisingHref(path, query, detail);
  const group = merchandisingGroup(query, options?.monobrand ?? true);
  const link =
    "inline-flex min-h-11 items-center rounded-lg border border-(--border) px-4 py-2 text-sm text-(--text) hover:bg-(--input-bg) touch-manipulation";
  return (
    <section>
      {screen !== "overview" ? (
        <Link
          href={href("/overview")}
          className="text-sm text-(--muted) hover:text-(--text) underline underline-offset-4"
        >
          {copy.back}
        </Link>
      ) : null}
      <h1 className="mt-3 text-2xl font-bold text-(--text)">
        {copy[screen]}
      </h1>
      {screen === "sales" || screen === "stock" ? (
        <nav aria-label={copy.grouping} className="mt-5 flex flex-wrap gap-2">
          {(options?.monobrand
            ? (["category", "sku"] as const)
            : (["brand", "category", "sku"] as const)
          ).map((item) => (
            <Link
              key={item}
              href={href(`/${screen}`, { groupBy: item })}
              aria-current={group === item ? "page" : undefined}
              className={
                link +
                " aria-[current=page]:border-(--text) aria-[current=page]:font-semibold"
              }
            >
              {copy[item]}
            </Link>
          ))}
        </nav>
      ) : null}
      <div className="mt-6 rounded-xl border border-(--border) bg-(--surface) p-5 md:p-6">
        <p className="max-w-2xl text-sm text-(--muted)">
          {copy.screenPending}
        </p>
        <nav aria-label={copy.primary} className="mt-5 flex flex-wrap gap-3">
          {screen === "overview" ? (
            <>
              <Link href={href("/sales")} className={link}>
                {copy.salesDetails}
              </Link>
              <Link href={href("/stock")} className={link}>
                {copy.stockDetails}
              </Link>
            </>
          ) : null}
          <Link href={href("/repricing")} className={link}>
            {copy.repricing}
          </Link>
          <Link href={href("/reordering")} className={link}>
            {copy.reordering}
          </Link>
        </nav>
      </div>
    </section>
  );
}
