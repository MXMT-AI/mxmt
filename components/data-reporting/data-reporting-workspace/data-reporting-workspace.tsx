"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { hasRole } from "@/lib/roles";
import { Link } from "@/i18n/navigation";
import { Heading } from "@/components/ui/heading/heading";
import { Text } from "@/components/ui/text/text";
import { panel } from "@/components/ui/panel/panel-styles";
import { dataReportingCopy } from "./data-reporting-copy";
import { ReportActionsToolbar } from "../report-actions-toolbar/report-actions-toolbar";
import { ReportImportNotices } from "../report-import-notices/report-import-notices";
import { ReportPeriodControls } from "../report-period-controls/report-period-controls";
import { ReportStatusSummary } from "../report-status-summary/report-status-summary";
import { ReportTableTabs, reportTablePanelId, reportTabId } from "../report-table-tabs/report-table-tabs";
import { ReportTableToolbar } from "../report-table-toolbar/report-table-toolbar";
import { ReportTablePagination, reportPaginationCopy } from "../report-table-pagination/report-table-pagination";
import { ReportTableState } from "../report-table-state/report-table-state";
import { useReportPreferences } from "../use-report-preferences/use-report-preferences";
import { useReportActions } from "../use-report-actions/use-report-actions";
import { useReportPeriod } from "../use-report-period/use-report-period";
import { useSheetsProjectionAvailability } from "../use-sheets-projection-availability/use-sheets-projection-availability";
import { useReportStatus } from "../use-report-status/use-report-status";
import { useReportTable } from "../use-report-table/use-report-table";
import ReportTable from "../report-table/report-table";
import { useLang } from "@/components/language-provider/language-provider";
import type {
  DataColumnMetadata,
  DataTableKey,
} from "@/lib/data-table-api";
import {
  canSortReportColumn,
  nextSortDirection,
  resolveVisibleColumns,
} from "@/lib/data-reporting-ui";

import type { InitialTablePreference } from "@/lib/data-table-preferences";

interface Props {
  userRole: string;
  initialPreferences: Partial<Record<DataTableKey, InitialTablePreference>>;
}

export default function DataReportingWorkspace({ userRole, initialPreferences }: Props) {
  const { lang } = useLang();
  const copy = dataReportingCopy[lang];
  const locale = lang === "uk" ? "uk-UA" : "en-GB";
  const [activeTab, setActiveTab] = useState<DataTableKey>("product_yml");
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const { dateFrom, dateTo, setDateFrom, setDateTo, initializePeriod } = useReportPeriod();
  const [reloadVersion, setReloadVersion] = useState(0);
  const [refreshMessage, setRefreshMessage] = useState(false);

  const { preference, saveState, updatePreference, resetSaveState } = useReportPreferences(initialPreferences, activeTab);
  const canImport = hasRole(userRole.toUpperCase(), "ADMIN");
  const canCalculate = hasRole(userRole.toUpperCase(), "ANALYST");
  const canRefreshReports = useSheetsProjectionAvailability(canImport, reloadVersion);
  const { action, actionError, reportsReady, periodError, setActionError, setPeriodError, runAction } = useReportActions({
    dateFrom, dateTo, canImport, lang, periodCopy: copy,
    onComplete: () => setPage(1),
    onReload: () => setReloadVersion(value => value + 1),
  });
  const { status, statusLoading } = useReportStatus({ reloadVersion, actionPending: action !== null, onError: setActionError });

  useEffect(() => {
    if (!statusLoading) initializePeriod(status?.calculation);
  }, [status?.calculation, statusLoading, initializePeriod]);

  const { table, loading, error } = useReportTable({
    activeTab, page, preference, reloadVersion, search, onPageChange: setPage,
  });

  const visibleKeys = useMemo(
    () => resolveVisibleColumns(table?.columns ?? [], preference.visibleColumns),
    [preference.visibleColumns, table?.columns]
  );
  const visibleSet = useMemo(() => new Set(visibleKeys), [visibleKeys]);
  const visibleColumns = useMemo(
    () => (table?.columns ?? []).filter((column) => visibleSet.has(column.key)),
    [table?.columns, visibleSet]
  );

  function selectTab(key: DataTableKey) {
    setActiveTab(key);
    setPage(1);
    setSearchInput("");
    setSearch("");
    resetSaveState(key);
  }

  function toggleColumn(key: string) {
    const current = visibleKeys;
    const nextColumns = current.includes(key)
      ? current.filter((column) => column !== key)
      : [...current, key];
    if (nextColumns.length === 0) return;
    updatePreference({ ...preference, visibleColumns: nextColumns });
  }

  const isSortable = (column: DataColumnMetadata) => canSortReportColumn(activeTab, column);

  function sortBy(column: DataColumnMetadata) {
    if (!isSortable(column)) return;
    const direction = nextSortDirection(preference.sortColumn, preference.sortDirection, column.key);
    setPage(1);
    updatePreference({ ...preference, sortColumn: column.key, sortDirection: direction });
  }

  return (
    <div className="p-5 md:p-8 min-w-0">
      <header className="flex flex-col xl:flex-row xl:items-start xl:justify-between gap-5 mb-6">
        <div>
          <p className="text-[10px] font-mono uppercase tracking-[0.22em] text-accent-cyan mb-2">{copy.eyebrow}</p>
          <Heading as="h1" variant="page" className="text-2xl font-semibold tracking-normal">{copy.title}</Heading>
          <Text variant="body" className="mt-1 max-w-2xl leading-5">{copy.subtitle}</Text>
        </div>
        <ReportActionsToolbar
          lang={lang}
          copy={copy}
          loading={loading || statusLoading}
          action={action}
          status={status}
          canCalculate={canCalculate}
          canImport={canImport}
          canRefreshReports={canRefreshReports}
          onRefresh={() => { setActionError(null); setRefreshMessage(true); setReloadVersion(value => value + 1); }}
          onAction={kind => { void runAction(kind); }}
        />
      </header>

      <ReportImportNotices
        lang={lang}
        status={status}
        statusLoading={statusLoading}
        viewRefreshed={refreshMessage && !loading && !statusLoading && !error && !actionError}
      />

      <ReportPeriodControls
        copy={copy} dateFrom={dateFrom} dateTo={dateTo} error={periodError}
        onDateFromChange={(value) => { setDateFrom(value); setPeriodError(null); }}
        onDateToChange={(value) => { setDateTo(value); setPeriodError(null); }}
      />

      {reportsReady && <p role="status" className="mb-4 text-sm text-(--text)">{lang==="uk"?"Дані MVP-звітів оновлено. ":"MVP report inputs refreshed. "}<Link className="underline" href="/overview">{lang==="uk"?"Відкрити Огляд":"Open Overview"}</Link></p>}
      {actionError && (
        <div role="alert" className="mb-4 flex items-start gap-2 rounded-lg border border-red-400/20 bg-red-400/10 px-3 py-2.5 text-sm text-accent-danger">
          <AlertTriangle size={15} className="mt-0.5 shrink-0" />
          <span>{actionError}</span>
        </div>
      )}

      <ReportStatusSummary status={status} loading={statusLoading} locale={locale} copy={copy} />

      <section className={panel + " overflow-hidden"}>
        <ReportTableTabs activeTab={activeTab} label={copy.title} onSelect={selectTab} />

        <ReportTableToolbar
          copy={copy}
          columns={table?.columns ?? []}
          visibleKeys={visibleKeys}
          searchInput={searchInput}
          pageSize={preference.pageSize}
          saveState={saveState}
          onSearch={() => { setPage(1); setSearch(searchInput.trim()); }}
          onSearchInputChange={setSearchInput}
          onColumnsChange={(visibleColumns) => table && updatePreference({ ...preference, visibleColumns })}
          onToggleColumn={toggleColumn}
          onPageSizeChange={(pageSize) => { setPage(1); updatePreference({ ...preference, pageSize }); }}
        />

        {table?.context.dateFrom && (
          <div className="px-4 py-2 border-b border-(--border) bg-accent-cyan/3 text-[11px] font-mono text-(--muted) flex flex-wrap gap-x-5 gap-y-1">
            <span>{copy.period}: <strong className="text-(--text) font-medium">{table.context.dateFrom} — {table.context.dateTo}</strong></span>
            <span>{copy.asOf}: <strong className="text-(--text) font-medium">{table.context.asOfDate}</strong></span>
          </div>
        )}

        <div id={reportTablePanelId} role="tabpanel" aria-labelledby={reportTabId(activeTab)} className="min-h-80">
          {loading ? (
            <ReportTableState state="loading" message={copy.loading} />
          ) : error ? (
            <ReportTableState state="error" message={error} retryLabel={copy.retry} onRetry={() => setReloadVersion(value => value + 1)} />
          ) : (table && table.rows.length === 0) || visibleColumns.length === 0 ? (
            <ReportTableState state="empty" message={table && table.rows.length === 0 ? copy.empty : copy.noColumns} />
          ) : (
            <ReportTable columns={visibleColumns} rows={table?.rows??[]} locale={locale} sortColumn={preference.sortColumn} direction={preference.sortDirection} onSort={sortBy} isSortable={isSortable}/>

          )}
        </div>

        {table && !loading && !error && (
          <ReportTablePagination
            pagination={table.pagination}
            requestedPage={page}
            locale={locale}
            copy={reportPaginationCopy[lang]}
            onPrevious={() => setPage(value => Math.max(1, value - 1))}
            onNext={() => setPage(value => value + 1)}
          />
        )}
      </section>
    </div>
  );
}
