"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Calculator,
  ChevronLeft,
  ChevronRight,
  LoaderCircle,
  RefreshCw,
  UploadCloud,
} from "lucide-react";
import {
  selectedSheetsProjectionIntent,
  refreshSelectedSheetsReports,
  SheetsReportingRefreshError,
  sheetsRefreshMessage,
} from "@/lib/client/sheets-reporting";
import { apiFetch } from "@/lib/fetch";
import { hasRole } from "@/lib/roles";
import { rawImportIsLive } from "@/lib/data-import-policy";
import { scheduleRawImportStatusCheck } from "@/lib/client/raw-import-status";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button/button";
import { Heading } from "@/components/ui/heading/heading";
import { Text } from "@/components/ui/text/text";
import { ReportPeriodControls } from "../report-period-controls/report-period-controls";
import { ReportStatusCard } from "../report-status-card/report-status-card";
import { ReportTableToolbar } from "../report-table-toolbar/report-table-toolbar";
import { useReportTable } from "../use-report-table";
import { responseMessage } from "../response-message";
import ReportTable from "../report-table/report-table";
import { useLang } from "@/components/language-provider/language-provider";
import type {
  DataColumnMetadata,
  DataTableKey,
} from "@/lib/data-table-api";
import {
  currentKyivMonth,
  nextSortDirection,
  resolveVisibleColumns,
  validateReportPeriod,
} from "@/lib/data-reporting-ui";

import { normalizeTablePreferences, type InitialTablePreference } from "@/lib/data-table-preferences";

interface Props {
  userRole: string;
  initialPreferences: Partial<Record<DataTableKey, InitialTablePreference>>;
}

interface DataStatus {
  connection: { fileId: string; revision: number } | null;
  configured: boolean;
  source: { name: string; timezone: string; updatedAt: string; driveFileId: string } | null;
  activeImport: { status: string; createdAt?: string; completedAt?: string | null; activatedAt?: string | null; finishedAt?: string | null } | null;
  latestImport: { status: string; createdAt: string; finishedAt?: string | null } | null;
  calculation: {
    status: string;
    dateFrom: string;
    dateTo: string;
    asOfDate: string;
    finishedAt?: string | null;
    completedAt?: string | null;
    createdAt: string;
  } | null;
  issueCounts: Record<string, number>;
}

const TABLES: Array<{ key: DataTableKey; label: string }> = [
  { key: "product_yml", label: "Product YML 2.0" },
  { key: "zavod_api", label: "ZAVOD_API" },
  { key: "article_report", label: "ARTICLE REPORT" },
  { key: "by_brand", label: "BY BRAND" },
  { key: "by_category", label: "BY CATEGORY" },
];

const COPY = {
  uk: {
    eyebrow: "Центр даних",
    title: "Дані та звіти",
    subtitle: "Вихідні вкладки Google Sheets і розраховані управлінські звіти.",
    import: "Імпортувати",
    calculate: "Перерахувати",
    refresh: "Оновити",
    importing: "Імпортуємо…",
    calculating: "Розраховуємо…",
    source: "Джерело",
    noSource: "Джерело не налаштовано",
    lastImport: "Останній імпорт",
    report: "Розрахунок",
    noRuns: "ще не запускався",
    issues: "Зауваження",
    search: "Пошук у поточній вкладці",
    searchButton: "Знайти",
    columns: "Колонки",
    visible: "видимих",
    all: "Усі",
    defaults: "За замовчуванням",
    rows: "Рядків на сторінці",
    loading: "Завантажуємо дані…",
    empty: "У цій вкладці немає рядків за заданими фільтрами.",
    noColumns: "Оберіть хоча б одну колонку.",
    page: "Сторінка",
    of: "з",
    records: "записів",
    previous: "Попередня сторінка",
    next: "Наступна сторінка",
    saved: "Вигляд збережено",
    saving: "Зберігаємо вигляд…",
    saveError: "Не вдалося зберегти вигляд",
    retry: "Спробувати знову",
    period: "Період",
    asOf: "Залишки на",
    active: "активний",
    warning: "із зауваженнями",
    success: "готово",
    reportPeriod: "Період звіту",
    dateFrom: "Дата від",
    dateTo: "Дата до",
    periodHelp: "Цей період буде використано під час імпорту та ручного перерахунку.",
    periodRequired: "Оберіть дату початку та дату завершення періоду.",
    periodReversed: "Дата початку не може бути пізніше дати завершення.",
  },
  en: {
    eyebrow: "Data center",
    title: "Data & Reports",
    subtitle: "Source Google Sheets tabs and calculated management reports.",
    import: "Import",
    calculate: "Recalculate",
    refresh: "Refresh",
    importing: "Importing…",
    calculating: "Calculating…",
    source: "Source",
    noSource: "Source is not configured",
    lastImport: "Last import",
    report: "Calculation",
    noRuns: "not run yet",
    issues: "Issues",
    search: "Search current tab",
    searchButton: "Search",
    columns: "Columns",
    visible: "visible",
    all: "All",
    defaults: "Defaults",
    rows: "Rows per page",
    loading: "Loading data…",
    empty: "No rows match the current filters.",
    noColumns: "Select at least one column.",
    page: "Page",
    of: "of",
    records: "records",
    previous: "Previous page",
    next: "Next page",
    saved: "View saved",
    saving: "Saving view…",
    saveError: "Could not save view",
    retry: "Try again",
    period: "Period",
    asOf: "Stock as of",
    active: "active",
    warning: "with issues",
    success: "ready",
    reportPeriod: "Report period",
    dateFrom: "Date from",
    dateTo: "Date to",
    periodHelp: "This period will be used for imports and manual recalculation.",
    periodRequired: "Select both the start and end date.",
    periodReversed: "The start date cannot be later than the end date.",
  },
} as const;

function dateTime(value: string | null | undefined, locale: string): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

export default function DataReportingWorkspace({ userRole, initialPreferences }: Props) {
  const { lang } = useLang();
  const copy = COPY[lang];
  const locale = lang === "uk" ? "uk-UA" : "en-GB";
  const [activeTab, setActiveTab] = useState<DataTableKey>("product_yml");
  const [preferences, setPreferences] = useState(() => normalizeTablePreferences(initialPreferences));
  const [status, setStatus] = useState<DataStatus | null>(null);
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [statusLoading, setStatusLoading] = useState(true);
  const [action, setAction] = useState<"import" | "calculate" | "projection" | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [reportsReady,setReportsReady]=useState(false);
  const [canRefreshReports, setCanRefreshReports] = useState(false);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [periodError, setPeriodError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [reloadVersion, setReloadVersion] = useState(0);
  const [refreshMessage, setRefreshMessage] = useState(false);
  const saveControllers = useRef<Partial<Record<DataTableKey, AbortController>>>({});
  const periodInitialized = useRef(false);

  const preference = preferences[activeTab];
  const canImport = hasRole(userRole.toUpperCase(), "ADMIN");
  const canCalculate = hasRole(userRole.toUpperCase(), "ANALYST");

  const loadStatus = useCallback(async (signal?: AbortSignal, quiet = false) => {
    if (!quiet) setStatusLoading(true);
    try {
      const response = await fetch("/api/data/status", { cache: "no-store", signal });
      if (!response.ok) throw new Error(await responseMessage(response));
      const nextStatus = await response.json() as DataStatus;
      if (!signal?.aborted) setStatus(nextStatus);
    } catch (loadError) {
      if (!signal?.aborted && !(loadError instanceof DOMException && loadError.name === "AbortError")) {
        setActionError(loadError instanceof Error ? loadError.message : "Could not load status");
        if (quiet) setStatus(current => current ? { ...current } : current);
      }
    } finally {
      if (!quiet && !signal?.aborted) setStatusLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void loadStatus(controller.signal);
    return () => controller.abort();
  }, [loadStatus, reloadVersion]);

  useEffect(() => {
    if (action !== null) return;
    const controller = new AbortController();
    const cancel = scheduleRawImportStatusCheck(
      status?.latestImport ?? null,
      () => { void loadStatus(controller.signal, true); },
      () => setStatus(current => current ? { ...current } : current),
    );
    return () => {
      cancel();
      controller.abort();
    };
  }, [status, action, loadStatus]);

  useEffect(() => {
    if (!canImport) return;
    const controller = new AbortController();
    setCanRefreshReports(false);
    void selectedSheetsProjectionIntent((path, init) =>
      apiFetch(path, { ...init, cache: "no-store", signal: controller.signal }),
    )
      .then((intent) => {
        if (!controller.signal.aborted) setCanRefreshReports(intent !== null);
      })
      .catch(() => {
        if (!controller.signal.aborted) setCanRefreshReports(false);
      });
    return () => controller.abort();
  }, [canImport, reloadVersion]);

  useEffect(() => {
    if (statusLoading || periodInitialized.current) return;
    const initialPeriod = status?.calculation
      ? {
          dateFrom: status.calculation.dateFrom.slice(0, 10),
          dateTo: status.calculation.dateTo.slice(0, 10),
        }
      : currentKyivMonth();
    setDateFrom(initialPeriod.dateFrom);
    setDateTo(initialPeriod.dateTo);
    periodInitialized.current = true;
  }, [status, statusLoading]);

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

  const savePreference = useCallback((key: DataTableKey, next: InitialTablePreference) => {
    saveControllers.current[key]?.abort();
    const controller = new AbortController();
    saveControllers.current[key] = controller;
    setSaveState("saving");
    void fetch(`/api/data/preferences/${key}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(next),
      signal: controller.signal,
    }).then(async (response) => {
      if (!response.ok) throw new Error(await responseMessage(response));
      setSaveState("saved");
    }).catch((saveError) => {
      if (!(saveError instanceof DOMException && saveError.name === "AbortError")) {
        setSaveState("error");
      }
    });
  }, []);

  function updatePreference(next: InitialTablePreference) {
    setPreferences((current) => ({ ...current, [activeTab]: next }));
    savePreference(activeTab, next);
  }

  function selectTab(key: DataTableKey) {
    setActiveTab(key);
    setPage(1);
    setSearchInput("");
    setSearch("");
    setSaveState("idle");
  }

  function toggleColumn(key: string) {
    const current = visibleKeys;
    const nextColumns = current.includes(key)
      ? current.filter((column) => column !== key)
      : [...current, key];
    if (nextColumns.length === 0) return;
    updatePreference({ ...preference, visibleColumns: nextColumns });
  }

  function sortBy(column: DataColumnMetadata) {
    const sortable = activeTab === "product_yml" || activeTab === "zavod_api"
      ? column.key === "rowNumber"
      : !column.sourceOnly;
    if (!sortable) return;
    const direction = nextSortDirection(preference.sortColumn, preference.sortDirection, column.key);
    setPage(1);
    updatePreference({ ...preference, sortColumn: column.key, sortDirection: direction });
  }

  async function runAction(kind: "import" | "calculate" | "projection") {
    const issue = validateReportPeriod(dateFrom, dateTo);
    if (issue && kind !== "projection") {
      setPeriodError(issue === "required" ? copy.periodRequired : copy.periodReversed);
      return;
    }
    setAction(kind);
    setActionError(null);
    setReportsReady(false);
    setPeriodError(null);
    try {
      const post = async (path:string,body:Record<string,unknown>) => {
        const response=await fetch(path,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
        if(!response.ok){
          if(response.status===504||response.status===408)throw new Error(lang==="uk"?"Сервер перевищив час очікування. Перевірте стан операції перед повтором (HTTP "+response.status+").":"The server timed out. Check the operation status before retrying (HTTP "+response.status+").");
          throw new Error(await responseMessage(response, lang));
        }
        return response.json();
      };
      let importedRunId:string|undefined;
      if(kind==="import"){
        const body=await post("/api/data/import",{dateFrom,dateTo,calculate:false});
        importedRunId=body.import?.importRunId;
      }
      const messages:string[]=[];
      if(canImport){
        try {
          const projected=await refreshSelectedSheetsReports(importedRunId);
          if(projected.state==="READY"){setReportsReady(true);window.dispatchEvent(new Event("connector-connection-changed"));}
          if(projected.state==="NOT_SELECTED"&&kind==="projection")messages.push(lang==="uk"?"Виберіть погоджене джерело Google Sheets у налаштуваннях.":"Select an approved Google Sheets reporting source in Settings.");
        }catch(error){
          const requestId=error instanceof SheetsReportingRefreshError?error.requestId:undefined;
          messages.push(sheetsRefreshMessage(error instanceof SheetsReportingRefreshError?error.code:"SHEETS_REFRESH_FAILED",lang)+(requestId?` (Request ID: ${requestId})`:""));
        }
      }
      if(kind!=="projection"){
        try {await post("/api/data/calculate",{dateFrom,dateTo,...(importedRunId?{importRunId:importedRunId}:{})});}
        catch(error){messages.push((lang==="uk"?"Розрахунок вкладок «Дані та звіти»: ":"Data & Reports tab calculation: ")+(error instanceof Error?error.message:"Calculation failed"));}
      }
      setActionError(messages.length?messages.join(" "):null);
      setPage(1);
    } catch (runError) {
      setActionError(runError instanceof Error ? runError.message : "Action failed");
    } finally {
      setReloadVersion((value)=>value+1);
      setAction(null);
    }
  }

  const lastImportDate = status?.activeImport?.completedAt
    ?? status?.activeImport?.finishedAt
    ?? status?.activeImport?.activatedAt
    ?? status?.latestImport?.finishedAt
    ?? status?.latestImport?.createdAt;
  const calculationDate = status?.calculation?.completedAt ?? status?.calculation?.finishedAt ?? status?.calculation?.createdAt;
  const issueTotal = Object.values(status?.issueCounts ?? {}).reduce((sum, count) => sum + count, 0);

  return (
    <div className="p-5 md:p-8 min-w-0">
      <header className="flex flex-col xl:flex-row xl:items-start xl:justify-between gap-5 mb-6">
        <div>
          <p className="text-[10px] font-mono uppercase tracking-[0.22em] text-accent-cyan mb-2">{copy.eyebrow}</p>
          <Heading as="h1" variant="page" className="text-2xl font-semibold tracking-normal">{copy.title}</Heading>
          <Text variant="body" className="mt-1 max-w-2xl leading-5">{copy.subtitle}</Text>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" onClick={() => {setActionError(null);setRefreshMessage(true);setReloadVersion((value) => value + 1);}}
            disabled={loading || statusLoading}
            className="inline-flex items-center gap-2 px-3 py-2 font-sans rounded-lg border border-(--border) bg-(--surface) text-sm text-(--muted) hover:text-(--text) hover:bg-(--input-hover) disabled:opacity-50 transition-colors">
            <RefreshCw size={14} className={loading || statusLoading ? "animate-spin" : ""} />
            {lang === "uk" ? "Оновити перегляд" : "Refresh view"}
          </Button>
          {canCalculate && (
            <Button type="button" onClick={() => void runAction("calculate")} disabled={action !== null || !status?.activeImport}
              className="inline-flex items-center gap-2 px-3 py-2 font-sans rounded-lg border border-(--border) bg-(--surface) text-sm text-(--text) hover:bg-(--input-hover) disabled:opacity-50 transition-colors">
              {action === "calculate" ? <LoaderCircle size={14} className="animate-spin" /> : <Calculator size={14} />}
              {action === "calculate" ? copy.calculating : copy.calculate}
            </Button>
          )}
          {canImport && <Button type="button" onClick={()=>void runAction("projection")} disabled={action!==null||!canRefreshReports}
            className="inline-flex items-center gap-2 px-3 py-2 font-sans rounded-lg border border-(--border) text-sm text-(--text) disabled:opacity-50 focus-visible:outline-solid focus-visible:outline-2">
            {action==="projection"?<LoaderCircle size={14} className="animate-spin"/>:<RefreshCw size={14}/>}{lang==="uk"?"Оновити MVP-звіти":"Refresh MVP reports"}
          </Button>}
          {canImport && (
            <Button type="button" onClick={() => void runAction("import")} disabled={action !== null || !status?.connection || rawImportIsLive(status?.latestImport ?? null)}
              variant="accent" className="inline-flex items-center gap-2 px-3 py-2">
              {action === "import" ? <LoaderCircle size={14} className="animate-spin" /> : <UploadCloud size={14} />}
              {action === "import" ? copy.importing : copy.import}
            </Button>
          )}
        </div>
      </header>

      <p className="mb-4 text-xs text-(--muted)">
        {lang === "uk"
          ? "Оновити перегляд — перечитати збережені дані. Імпортувати — завантажити таблицю з Google. Оновити MVP-звіти — перенести збережений імпорт у п’ять основних екранів."
          : "Refresh view reloads saved data. Import downloads the workbook from Google. Refresh MVP reports projects the saved import into the five main screens."}
      </p>
      {!statusLoading && status && <p className="mb-4 break-all text-sm text-(--muted)">
        {status.connection ? <>{lang === "uk" ? "Наступний імпорт: " : "Next import: "}
          <a href={`https://docs.google.com/spreadsheets/d/${status.connection.fileId}/edit`} target="_blank" rel="noreferrer" className="underline">{status.connection.fileId}</a>
          {status.source && status.source.driveFileId !== status.connection.fileId && <span className="block mt-1">{lang === "uk"
            ? "Зараз показано попередній імпорт з іншої таблиці. Збереження нового підключення не змінює вже завантажені дані."
            : "The previous import from another spreadsheet is displayed. Saving a connection does not replace imported data."}</span>}
        </> : <>{lang === "uk" ? "Спочатку прив’яжіть Google Sheets до цього кабінету: " : "Connect this cabinet’s Google Sheets first: "}<Link href="/settings" className="underline">{lang === "uk" ? "Налаштування" : "Settings"}</Link></>}
      </p>}
      {refreshMessage && !loading && !statusLoading && !error && !actionError && <p role="status" className="mb-4 text-sm">{lang === "uk" ? "Перегляд збережених даних оновлено." : "Saved-data view refreshed."}</p>}
      {status?.latestImport?.status === "RUNNING" && <p role="status" className="mb-4 text-sm">{rawImportIsLive(status.latestImport)
        ? (lang === "uk" ? "Імпорт виконується; показано попередні дані. Стан перевіряється кожні 10 секунд." : "Import is running; previous data is shown. Status is checked every 10 seconds.")
        : (lang === "uk" ? "Попередній імпорт перевищив час виконання. Натисніть «Імпортувати» для відновлення; старі дані збережені." : "The previous import exceeded its execution window. Click Import to recover; previous data is retained.")}</p>}

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

      <section aria-label="Data status" className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 mb-6">
        <ReportStatusCard label={copy.source} value={status?.source?.name ?? copy.noSource}
          detail={status?.source?.timezone ?? "Europe/Kyiv"} loading={statusLoading} />
        <ReportStatusCard label={copy.lastImport} value={dateTime(lastImportDate, locale)}
          detail={status?.activeImport?.status ?? status?.latestImport?.status ?? copy.noRuns}
          status={status?.activeImport?.status ?? status?.latestImport?.status} loading={statusLoading} />
        <ReportStatusCard label={copy.report} value={dateTime(calculationDate, locale)}
          detail={status?.calculation?.status ?? copy.noRuns}
          status={status?.calculation?.status} loading={statusLoading} />
        <ReportStatusCard label={copy.issues} value={String(issueTotal)}
          detail={issueTotal > 0 ? copy.warning : copy.success}
          status={issueTotal > 0 ? "WARNING" : "SUCCESS"} loading={statusLoading} />
      </section>

      <section className="rounded-xl border border-(--border) bg-(--surface) overflow-hidden">
        <div className="overflow-x-auto border-b border-(--border)">
          <div role="tablist" aria-label={copy.title} className="flex min-w-max px-2 pt-2">
            {TABLES.map((item) => (
              <Button key={item.key} id={`tab-${item.key}`} role="tab"
                aria-selected={activeTab === item.key} aria-controls="data-table-panel"
                type="button" onClick={() => selectTab(item.key)}
                className={`rounded-none border-x-0 border-t-0 px-4 py-3 border-b-2 text-xs font-mono font-semibold tracking-wide transition-colors ${
                  activeTab === item.key
                    ? "border-accent-cyan text-accent-cyan"
                    : "border-transparent text-(--muted) hover:text-(--text)"
                }`}>
                {item.label}
              </Button>
            ))}
          </div>
        </div>

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

        <div id="data-table-panel" role="tabpanel" aria-labelledby={`tab-${activeTab}`} className="min-h-80">
          {loading ? (
            <div className="h-80 flex flex-col items-center justify-center gap-3 text-sm text-(--muted)">
              <LoaderCircle size={22} className="animate-spin text-accent-cyan" />
              {copy.loading}
            </div>
          ) : error ? (
            <div role="alert" className="h-80 flex flex-col items-center justify-center gap-3 px-5 text-center">
              <AlertTriangle size={24} className="text-accent-yellow" />
              <p className="text-sm text-(--muted) max-w-xl">{error}</p>
              <Button type="button" onClick={() => setReloadVersion((value) => value + 1)}
                className="px-3 py-2 font-sans rounded-lg border border-(--border) text-xs text-(--text) hover:bg-(--input-hover)">{copy.retry}</Button>
            </div>
          ) : table && table.rows.length === 0 ? (
            <div className="h-80 flex items-center justify-center px-5 text-sm text-(--muted) text-center">{copy.empty}</div>
          ) : visibleColumns.length === 0 ? (
            <div className="h-80 flex items-center justify-center px-5 text-sm text-(--muted) text-center">{copy.noColumns}</div>
          ) : (
            <ReportTable columns={visibleColumns} rows={table?.rows??[]} locale={locale} sortColumn={preference.sortColumn} direction={preference.sortDirection} onSort={sortBy} isSortable={column=>activeTab==='product_yml'||activeTab==='zavod_api'?column.key==='rowNumber':!column.sourceOnly}/>

          )}
        </div>

        {table && !loading && !error && (
          <footer className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-4 py-3 border-t border-(--border) text-xs text-(--muted)">
            <span>{table.pagination.totalRows.toLocaleString(locale)} {copy.records}</span>
            <div className="flex items-center gap-2">
              <Button type="button" aria-label={copy.previous} title={copy.previous} disabled={page <= 1}
                onClick={() => setPage((value) => Math.max(1, value - 1))}
                className="w-8 h-8 p-0 inline-flex items-center justify-center rounded-lg border border-(--border) hover:bg-(--input-hover) disabled:opacity-35">
                <ChevronLeft size={14} />
              </Button>
              <span className="min-w-28 text-center">{copy.page} {table.pagination.page} {copy.of} {Math.max(1, table.pagination.totalPages)}</span>
              <Button type="button" aria-label={copy.next} title={copy.next}
                disabled={table.pagination.totalPages === 0 || page >= table.pagination.totalPages}
                onClick={() => setPage((value) => value + 1)}
                className="w-8 h-8 p-0 inline-flex items-center justify-center rounded-lg border border-(--border) hover:bg-(--input-hover) disabled:opacity-35">
                <ChevronRight size={14} />
              </Button>
            </div>
          </footer>
        )}
      </section>
    </div>
  );
}
