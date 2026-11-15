"use client";
import { Link } from "@/i18n/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useLang } from "@/components/language-provider/language-provider";
import { ukSalesColumns } from "@/lib/sales-report-labels";
import { nextSortDirection } from "@/lib/data-reporting-ui";
import type { SalesView } from "@/lib/sales-report-view";
import { Button } from "@/components/ui/button/button";
import { DateField } from "@/components/ui/date-field/date-field";
import { Heading } from "@/components/ui/heading/heading";
import { Text } from "@/components/ui/text/text";
import { useSalesReport } from "../use-sales-report";
import { SalesCurrencySummary } from "../sales-currency-summary/sales-currency-summary";
import { SalesReportDetails } from "../sales-report-details/sales-report-details";
import { salesReportReason } from "./sales-report-copy";
import ReportTable from "../report-table/report-table";
const control =
  "rounded-lg border border-(--border) bg-(--surface) px-3 py-2 font-sans text-sm text-(--text) focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50 touch-manipulation aria-pressed:border-(--text) aria-pressed:font-semibold";
const field = "mt-1 block w-full " + control;

export default function SalesReportingWorkspace() {
  const { lang } = useLang(),
    uk = lang === "uk",
    locale = uk ? "uk-UA" : "en-GB";
  const [view, setView] = useState<SalesView>("articles");
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("name");
  const [direction, setDirection] = useState<"asc" | "desc">("asc");
  const errorRef = useRef<HTMLParagraphElement>(null);
  const { data, error, busy, period, setPeriod, applyPeriod, refresh, exportHref } = useSalesReport({
    view, page, search, sort, direction, locale: lang,
  });
  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);
  const text = (code: string) => salesReportReason(code, uk);
  const apply = (event: FormEvent) => {
    event.preventDefault();
    if (applyPeriod()) setPage(1);
  };
  const labels: Record<SalesView, string> = uk
    ? {
        articles: "SKU",
        brands: "Бренди",
        categories: "Категорії",
        channels: "Канали",
      }
    : {
        articles: "SKUs",
        brands: "Brands",
        categories: "Categories",
        channels: "Channels",
      };
  const columns =
    data?.table.columns.map((c) => ({
      ...c,
      label: uk ? (ukSalesColumns[c.key] ?? c.label) : c.label,
    })) ?? [];
  const rows =
    data?.table.rows.map((row) => ({
      ...row,
      coverage:
        row.coverage === "COMPLETE"
          ? uk
            ? "Повне"
            : "Complete"
          : row.coverage === "PARTIAL"
            ? uk
              ? "Часткове"
              : "Partial"
            : uk
              ? "Недоступне"
              : "Unavailable",
      comparisonReason: row.comparisonReason
        ? text(String(row.comparisonReason))
        : "",
    })) ?? [];
  return (
    <div className="p-5 md:p-8 min-w-0 space-y-5">
      <header>
        <Heading as="h1" variant="page" className="text-2xl font-semibold tracking-normal">
          {uk ? "Продажі та маржа SalesDrive" : "SalesDrive sales and margin"}
        </Heading>
        <Text variant="body" className="mt-1 leading-5">
          {uk
            ? "Продажі за датою оплати, повернення за підтвердженою датою. Валюти показано окремо."
            : "Sales by payment date and returns by verified return date. Currencies remain separate."}
        </Text>
      </header>
      <form onSubmit={apply} className="flex flex-wrap items-end gap-3">
        <DateField
          id="sales-from" name="sales-from" variant="stacked"
          label={uk ? "Дата від" : "Date from"}
          value={period.from}
          onChange={(event) => setPeriod((current) => ({ ...current, from: event.target.value }))}
          className="h-auto py-2"
        />
        <DateField
          id="sales-to" name="sales-to" variant="stacked"
          label={uk ? "Дата до" : "Date to"}
          value={period.to}
          onChange={(event) => setPeriod((current) => ({ ...current, to: event.target.value }))}
          className="h-auto py-2"
        />
        <Button type="submit" className={control} disabled={busy}>
          {busy
            ? uk
              ? "Розрахунок…"
              : "Calculating…"
            : uk
              ? "Застосувати період"
              : "Apply period"}
        </Button>
        <Button
          type="button"
          className={control}
          disabled={busy}
          onClick={refresh}
        >
          {uk ? "Оновити розрахунок" : "Refresh calculation"}
        </Button>
      </form>
      {busy && (
        <p role="status" className="text-sm text-(--muted)">
          {uk ? "Завантаження…" : "Loading…"}
        </p>
      )}
      {error && (
        <p
          ref={errorRef}
          tabIndex={-1}
          role="alert"
          className="text-sm text-accent-danger"
        >
          {error === "INVALID_REPORT_PERIOD"
            ? uk
              ? "Перевірте обидві дати: період до 366 днів, без майбутніх дат."
              : "Check both dates: up to 366 days, without future dates."
            : error === "SALESDRIVE_NOT_CONFIGURED"
              ? uk
                ? "Налаштуйте SalesDrive у налаштуваннях."
                : "Configure SalesDrive in Settings."
              : error === "SALES_IMPORT_NOT_READY"
                ? uk
                  ? "Дочекайтесь завершення першого імпорту замовлень."
                  : "Wait for the first order import to finish."
                : uk
                  ? "Не вдалося завантажити звіт. Повторіть після синхронізації."
                  : "Could not load the report. Retry after synchronization."}{" "}
          <Link className="underline" href="/settings">
            {uk ? "Налаштування" : "Settings"}
          </Link>
        </p>
      )}
      {data && !busy && !error && (
        <>
          <p className="text-sm text-(--muted)">
            {data.period.from} — {data.period.to} · LY {data.period.lyFrom} —{" "}
            {data.period.lyTo}
            {(!data.history.current || !data.history.ly) && (
              <span className="block text-(--text) font-medium">
                {uk
                  ? "Історія неповна або вхідні дані потребують перевірки. Порівняння LY недоступне."
                  : "History is incomplete or inputs require review. LY comparison is unavailable."}
              </span>
            )}
          </p>
          <div className="space-y-3">
            {data.summary.map((row) => <SalesCurrencySummary key={row.currency ?? "unknown"} row={row} uk={uk} />)}
          </div>
          <nav
            aria-label={uk ? "Фінансові зрізи" : "Financial views"}
            className="flex flex-wrap gap-2"
          >
            {Object.entries(labels).map(([key, label]) => (
              <Button
                key={key}
                type="button"
                className={control}
                aria-pressed={view === key}
                onClick={() => {
                  setPage(1);
                  setView(key as SalesView);
                }}
              >
                {label}
              </Button>
            ))}
          </nav>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setPage(1);
              setSearch(q);
            }}
            className="flex flex-wrap items-end gap-2"
          >
            <label className="min-w-0 flex-1 text-sm text-(--muted)">
              {uk ? "Пошук у зрізі" : "Search this view"}
              <input
                name="sales-search"
                autoComplete="off"
                maxLength={200}
                className={field}
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </label>
            <Button type="submit" className={control}>{uk ? "Знайти" : "Search"}</Button>
            {exportHref && (
              <a className={control} href={exportHref}>
                {uk ? "Експорт CSV" : "Export CSV"}
              </a>
            )}
          </form>
          {rows.length ? (
            <ReportTable
              columns={columns}
              rows={rows}
              locale={locale}
              sortColumn={sort}
              direction={direction}
              isSortable={() => true}
              onSort={(c) => {
                setPage(1);
                setDirection(nextSortDirection(sort, direction, c.key));
                setSort(c.key);
              }}
            />
          ) : (
            <p className="text-sm text-(--muted)">
              {uk
                ? "Немає рядків за цими фільтрами."
                : "No rows match these filters."}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-3 text-sm text-(--muted)">
            <Button
              type="button"
              className={control}
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              {uk ? "Назад" : "Previous"}
            </Button>
            <span>
              {page} / {Math.max(1, data.table.pagination.totalPages)} ·{" "}
              {data.table.pagination.totalRows}
            </span>
            <Button
              type="button"
              className={control}
              disabled={page >= data.table.pagination.totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              {uk ? "Далі" : "Next"}
            </Button>
          </div>
          <SalesReportDetails data={data} uk={uk} />
          <p className="break-all text-xs text-(--muted)">
            {uk ? "Розрахунок" : "Calculation"}: {data.calculationRunId} ·{" "}
            {uk ? "Версія формул" : "Formula version"} {data.calculationVersion}
            .{" "}
            {uk
              ? "29 лютого → 28 лютого LY. Діапазон історії базується на імпорті за датами створення замовлень, не на підтвердженому бухгалтерському звірянні."
              : "29 February → 28 February LY. History coverage follows imported order-creation windows, not verified accounting reconciliation."}
          </p>
        </>
      )}
    </div>
  );
}
