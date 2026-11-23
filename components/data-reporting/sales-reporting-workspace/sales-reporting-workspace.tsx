"use client";
import { commonActions } from "@/i18n/common-actions";
import { Link } from "@/i18n/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useLang } from "@/components/language-provider/language-provider";
import { ukSalesColumns } from "@/lib/sales-report-labels";
import { nextSortDirection } from "@/lib/data-reporting-ui";
import type { SalesView } from "@/lib/sales-report-view";
import { Button } from "@/components/ui/button/button";
import { controlBase } from "@/components/ui/control-styles/control-styles";
import { DateField } from "@/components/ui/date-field/date-field";
import { Field } from "@/components/ui/field/field";
import { Heading } from "@/components/ui/heading/heading";
import { Note } from "@/components/ui/note/note";
import { Text } from "@/components/ui/text/text";
import { useSalesReport } from "../use-sales-report/use-sales-report";
import { SalesCurrencySummary } from "../sales-currency-summary/sales-currency-summary";
import { SalesReportDetails } from "../sales-report-details/sales-report-details";
import { salesReportErrorMessage, salesReportReason, salesWorkspaceCopy } from "./sales-report-copy";
import ReportTable from "../report-table/report-table";
import { ReportTablePagination, reportPaginationCopy } from "../report-table-pagination/report-table-pagination";
import { dataReportingSalesReportingWorkspaceMessages as englishCopy } from "@/messages/en.json";
import { dataReportingSalesReportingWorkspaceMessages as ukrainianCopy } from "@/messages/uk.json";

const control =
  controlBase + " bg-(--surface) py-2 font-sans text-sm touch-manipulation";
const viewControl = control + " aria-pressed:border-(--text) aria-pressed:font-semibold";
const field = control + " w-full";

export default function SalesReportingWorkspace() {
  const { lang } = useLang(),
    uk = lang === "uk",
    locale = uk ? "uk-UA" : "en-GB";
  const copy = salesWorkspaceCopy[lang];
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
  const apply = (event: FormEvent) => {
    event.preventDefault();
    if (applyPeriod()) setPage(1);
  };
  const periodFields = [
    { key: "from", label: copy.dateFrom },
    { key: "to", label: copy.dateTo },
  ] as const;
  const columns =
    data?.table.columns.map((c) => ({
      ...c,
      label: uk ? (ukSalesColumns[c.key] ?? c.label) : c.label,
    })) ?? [];
  const rows =
    data?.table.rows.map((row) => ({
      ...row,
      coverage: copy.coverage[
        row.coverage === "COMPLETE" || row.coverage === "PARTIAL" ? row.coverage : "UNAVAILABLE"
      ],
      comparisonReason: row.comparisonReason
        ? salesReportReason(String(row.comparisonReason), uk)
        : "",
    })) ?? [];
  return (
    <div className="p-5 md:p-8 min-w-0 space-y-5">
      <header>
        <Heading as="h1" variant="page" className="text-2xl font-semibold tracking-normal">
          {uk ? ukrainianCopy.salesDriveSalesAndMargin : englishCopy.salesDriveSalesAndMargin}
        </Heading>
        <Text variant="body" className="mt-1 leading-5">
          {uk
            ? ukrainianCopy.salesByPaymentDateAnd
            : englishCopy.salesByPaymentDateAnd}
        </Text>
      </header>
      <form onSubmit={apply} className="flex flex-wrap items-end gap-3">
        {periodFields.map(({ key, label }) => (
          <DateField
            key={key}
            id={`sales-${key}`}
            name={`sales-${key}`}
            variant="stacked"
            label={label}
            value={period[key]}
            onChange={(event) => {
              const value = event.target.value;
              setPeriod((current) => ({ ...current, [key]: value }));
            }}
            className="h-auto py-2"
          />
        ))}
        <Button type="submit" className={control} disabled={busy}>
          {busy ? copy.calculating : copy.applyPeriod}
        </Button>
        <Button
          type="button"
          className={control}
          disabled={busy}
          onClick={refresh}
        >
          {uk ? ukrainianCopy.refreshCalculation : englishCopy.refreshCalculation}
        </Button>
      </form>
      {busy && (
        <p role="status" className="text-sm text-(--muted)">
          {commonActions[lang].loading}
        </p>
      )}
      {error && (
        <p
          ref={errorRef}
          tabIndex={-1}
          role="alert"
          className="text-sm text-accent-danger"
        >
          {salesReportErrorMessage(error, lang)}{" "}
          <Link className="underline" href="/settings">
            {uk ? ukrainianCopy.settings : englishCopy.settings}
          </Link>
        </p>
      )}
      {data && !busy && !error && (
        <>
          <p className="text-sm text-(--muted)">
            {data.period.from} — {data.period.to}{englishCopy.lY}{data.period.lyFrom} —{" "}
            {data.period.lyTo}
            {(!data.history.current || !data.history.ly) && (
              <span className="block text-(--text) font-medium">
                {uk
                  ? ukrainianCopy.historyIsIncompleteOrInputs
                  : englishCopy.historyIsIncompleteOrInputs}
              </span>
            )}
          </p>
          <div className="space-y-3">
            {data.summary.map((row) => <SalesCurrencySummary key={row.currency ?? "unknown"} row={row} uk={uk} />)}
          </div>
          <nav
            aria-label={uk ? ukrainianCopy.ariaLabelFinancialViews : englishCopy.ariaLabelFinancialViews}
            className="flex flex-wrap gap-2"
          >
            {Object.entries(copy.views).map(([key, label]) => (
              <Button
                key={key}
                type="button"
                className={viewControl}
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
            <Field label={uk ? ukrainianCopy.labelSearchThisView : englishCopy.labelSearchThisView} className="flex-1 gap-1 text-sm">
              <input
                name="sales-search"
                autoComplete="off"
                maxLength={200}
                className={field}
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </Field>
            <Button type="submit" className={control}>{uk ? ukrainianCopy.search : englishCopy.search}</Button>
            {exportHref && (
              <a className={control} href={exportHref}>
                {uk ? ukrainianCopy.exportCSV : englishCopy.exportCSV}
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
                ? ukrainianCopy.noRowsMatchTheseFilters
                : englishCopy.noRowsMatchTheseFilters}
            </p>
          )}
          <ReportTablePagination
            pagination={{ ...data.table.pagination, page }}
            requestedPage={page}
            locale={locale}
            copy={reportPaginationCopy[lang]}
            onPrevious={() => setPage((current) => current - 1)}
            onNext={() => setPage((current) => current + 1)}
          />
          <SalesReportDetails data={data} uk={uk} />
          <Note className="break-all leading-4">
            {uk ? ukrainianCopy.calculation : englishCopy.calculation}: {data.calculationRunId} ·{" "}
            {uk ? ukrainianCopy.formulaVersion : englishCopy.formulaVersion} {data.calculationVersion}
            .{" "}
            {uk
              ? ukrainianCopy["29February28February"]
              : englishCopy["29February28February"]}
          </Note>
        </>
      )}
    </div>
  );
}
