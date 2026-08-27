"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  CalendarDays,
  Calculator,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Columns3,
  LoaderCircle,
  RefreshCw,
  Search,
  UploadCloud,
} from "lucide-react";
import { useLang } from "@/components/LanguageProvider";
import type {
  DataColumnMetadata,
  DataTableKey,
  DataTableResponse,
} from "@/lib/data-table-api";
import {
  currentKyivMonth,
  formatTableValue,
  nextSortDirection,
  resolveVisibleColumns,
  validateReportPeriod,
} from "@/lib/data-reporting-ui";

export interface InitialTablePreference {
  visibleColumns: string[];
  pageSize: number;
  sortColumn: string | null;
  sortDirection: "asc" | "desc";
}

interface Props {
  userRole: string;
  initialPreferences: Partial<Record<DataTableKey, InitialTablePreference>>;
}

interface DataStatus {
  configured: boolean;
  source: { name: string; timezone: string; updatedAt: string } | null;
  activeImport: { status: string; activatedAt?: string | null; finishedAt?: string | null } | null;
  latestImport: { status: string; createdAt: string; finishedAt?: string | null } | null;
  calculation: {
    status: string;
    dateFrom: string;
    dateTo: string;
    asOfDate: string;
    finishedAt?: string | null;
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

const DEFAULT_PREFERENCE: InitialTablePreference = {
  visibleColumns: [],
  pageSize: 50,
  sortColumn: null,
  sortDirection: "asc",
};

function normalizePreferences(
  initial: Partial<Record<DataTableKey, InitialTablePreference>>
): Record<DataTableKey, InitialTablePreference> {
  return Object.fromEntries(
    TABLES.map(({ key }) => [key, { ...DEFAULT_PREFERENCE, ...initial[key] }])
  ) as Record<DataTableKey, InitialTablePreference>;
}

async function responseMessage(response: Response): Promise<string> {
  const fallback = `${response.status} ${response.statusText}`.trim();
  const payload = await response.json().catch(() => null) as
    | { error?: string | { message?: string }; message?: string }
    | null;
  if (typeof payload?.error === "string") return payload.error;
  if (payload?.error && typeof payload.error === "object" && payload.error.message) {
    return payload.error.message;
  }
  return payload?.message ?? fallback;
}

function dateTime(value: string | null | undefined, locale: string): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function statusTone(status: string | null | undefined): string {
  if (status === "SUCCESS") return "text-emerald-400 bg-emerald-400/10 border-emerald-400/20";
  if (status === "WARNING") return "text-amber-400 bg-amber-400/10 border-amber-400/20";
  if (status === "RUNNING" || status === "PENDING") return "text-sky-400 bg-sky-400/10 border-sky-400/20";
  return "text-[var(--muted)] bg-[var(--input-bg)] border-[var(--border)]";
}

export default function DataReportingWorkspace({ userRole, initialPreferences }: Props) {
  const { lang } = useLang();
  const copy = COPY[lang];
  const locale = lang === "uk" ? "uk-UA" : "en-GB";
  const [activeTab, setActiveTab] = useState<DataTableKey>("product_yml");
  const [preferences, setPreferences] = useState(() => normalizePreferences(initialPreferences));
  const [table, setTable] = useState<DataTableResponse | null>(null);
  const [status, setStatus] = useState<DataStatus | null>(null);
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [statusLoading, setStatusLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [action, setAction] = useState<"import" | "calculate" | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [periodError, setPeriodError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [reloadVersion, setReloadVersion] = useState(0);
  const saveControllers = useRef<Partial<Record<DataTableKey, AbortController>>>({});
  const periodInitialized = useRef(false);

  const preference = preferences[activeTab];
  const canImport = ["ADMIN", "SUPER_ADMIN"].includes(userRole.toUpperCase());
  const canCalculate = ["ANALYST", "ADMIN", "SUPER_ADMIN"].includes(userRole.toUpperCase());

  const loadStatus = useCallback(async (signal?: AbortSignal) => {
    setStatusLoading(true);
    try {
      const response = await fetch("/api/data/status", { cache: "no-store", signal });
      if (!response.ok) throw new Error(await responseMessage(response));
      setStatus(await response.json() as DataStatus);
    } catch (loadError) {
      if (!(loadError instanceof DOMException && loadError.name === "AbortError")) {
        setActionError(loadError instanceof Error ? loadError.message : "Could not load status");
      }
    } finally {
      if (!signal?.aborted) setStatusLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void loadStatus(controller.signal);
    return () => controller.abort();
  }, [loadStatus, reloadVersion]);

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

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(preference.pageSize),
      direction: preference.sortDirection,
    });
    if (search) params.set("search", search);
    if (preference.sortColumn) params.set("sort", preference.sortColumn);

    setLoading(true);
    setTable(null);
    setError(null);
    fetch(`/api/data/tables/${activeTab}?${params}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(await responseMessage(response));
        return response.json() as Promise<DataTableResponse>;
      })
      .then((result) => {
        setTable(result);
        if (result.pagination.totalPages > 0 && page > result.pagination.totalPages) {
          setPage(result.pagination.totalPages);
        }
      })
      .catch((loadError) => {
        if (!(loadError instanceof DOMException && loadError.name === "AbortError")) {
          setTable(null);
          setError(loadError instanceof Error ? loadError.message : "Could not load data");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [activeTab, page, preference.pageSize, preference.sortColumn, preference.sortDirection, reloadVersion, search]);

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
    setError(null);
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

  async function runAction(kind: "import" | "calculate") {
    const issue = validateReportPeriod(dateFrom, dateTo);
    if (issue) {
      setPeriodError(issue === "required" ? copy.periodRequired : copy.periodReversed);
      return;
    }
    setAction(kind);
    setActionError(null);
    setPeriodError(null);
    try {
      const response = await fetch(kind === "import" ? "/api/data/import" : "/api/data/calculate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dateFrom, dateTo }),
      });
      if (!response.ok) throw new Error(await responseMessage(response));
      setPage(1);
      setReloadVersion((value) => value + 1);
    } catch (runError) {
      setActionError(runError instanceof Error ? runError.message : "Action failed");
    } finally {
      setAction(null);
    }
  }

  const lastImportDate = status?.activeImport?.finishedAt
    ?? status?.activeImport?.activatedAt
    ?? status?.latestImport?.finishedAt
    ?? status?.latestImport?.createdAt;
  const calculationDate = status?.calculation?.finishedAt ?? status?.calculation?.createdAt;
  const issueTotal = Object.values(status?.issueCounts ?? {}).reduce((sum, count) => sum + count, 0);

  return (
    <div className="p-5 md:p-8 min-w-0">
      <header className="flex flex-col xl:flex-row xl:items-start xl:justify-between gap-5 mb-6">
        <div>
          <p className="text-[10px] font-mono uppercase tracking-[0.22em] text-[#00e5c4] mb-2">{copy.eyebrow}</p>
          <h1 className="text-2xl font-semibold text-[var(--text)]">{copy.title}</h1>
          <p className="text-sm text-[var(--muted)] mt-1 max-w-2xl">{copy.subtitle}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => setReloadVersion((value) => value + 1)}
            disabled={loading || statusLoading}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] text-sm text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--input-hover)] disabled:opacity-50 transition-colors">
            <RefreshCw size={14} className={loading || statusLoading ? "animate-spin" : ""} />
            {copy.refresh}
          </button>
          {canCalculate && (
            <button type="button" onClick={() => void runAction("calculate")} disabled={action !== null || !status?.activeImport}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] text-sm text-[var(--text)] hover:bg-[var(--input-hover)] disabled:opacity-50 transition-colors">
              {action === "calculate" ? <LoaderCircle size={14} className="animate-spin" /> : <Calculator size={14} />}
              {action === "calculate" ? copy.calculating : copy.calculate}
            </button>
          )}
          {canImport && (
            <button type="button" onClick={() => void runAction("import")} disabled={action !== null}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-[#00e5c4] text-[#03110f] text-sm font-semibold hover:bg-[#36ecd2] disabled:opacity-50 transition-colors">
              {action === "import" ? <LoaderCircle size={14} className="animate-spin" /> : <UploadCloud size={14} />}
              {action === "import" ? copy.importing : copy.import}
            </button>
          )}
        </div>
      </header>

      <section aria-labelledby="report-period-heading" className="mb-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3">
        <div className="flex flex-col xl:flex-row xl:items-end gap-3 xl:gap-5">
          <div className="flex items-start gap-2 xl:min-w-72">
            <CalendarDays size={16} className="mt-0.5 shrink-0 text-[#00e5c4]" />
            <div>
              <h2 id="report-period-heading" className="text-sm font-medium text-[var(--text)]">{copy.reportPeriod}</h2>
              <p className="mt-0.5 text-[11px] text-[var(--muted)]">{copy.periodHelp}</p>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row gap-3">
            <label className="grid gap-1 text-[11px] text-[var(--muted)]">
              <span>{copy.dateFrom}</span>
              <input type="date" value={dateFrom} max={dateTo || undefined}
                aria-invalid={Boolean(periodError)}
                onChange={(event) => { setDateFrom(event.target.value); setPeriodError(null); }}
                className="h-9 rounded-lg border border-[var(--border)] bg-[var(--input-bg)] px-3 text-sm text-[var(--text)]" />
            </label>
            <label className="grid gap-1 text-[11px] text-[var(--muted)]">
              <span>{copy.dateTo}</span>
              <input type="date" value={dateTo} min={dateFrom || undefined}
                aria-invalid={Boolean(periodError)}
                onChange={(event) => { setDateTo(event.target.value); setPeriodError(null); }}
                className="h-9 rounded-lg border border-[var(--border)] bg-[var(--input-bg)] px-3 text-sm text-[var(--text)]" />
            </label>
          </div>
        </div>
        {periodError && <p role="alert" className="mt-2 text-xs text-red-400">{periodError}</p>}
      </section>

      {actionError && (
        <div role="alert" className="mb-4 flex items-start gap-2 rounded-lg border border-red-400/20 bg-red-400/10 px-3 py-2.5 text-sm text-red-300">
          <AlertTriangle size={15} className="mt-0.5 shrink-0" />
          <span>{actionError}</span>
        </div>
      )}

      <section aria-label="Data status" className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 mb-6">
        <StatusCard label={copy.source} value={status?.source?.name ?? copy.noSource}
          detail={status?.source?.timezone ?? "Europe/Kyiv"} loading={statusLoading} />
        <StatusCard label={copy.lastImport} value={dateTime(lastImportDate, locale)}
          detail={status?.activeImport?.status ?? status?.latestImport?.status ?? copy.noRuns}
          badgeClass={statusTone(status?.activeImport?.status ?? status?.latestImport?.status)} loading={statusLoading} />
        <StatusCard label={copy.report} value={dateTime(calculationDate, locale)}
          detail={status?.calculation?.status ?? copy.noRuns}
          badgeClass={statusTone(status?.calculation?.status)} loading={statusLoading} />
        <StatusCard label={copy.issues} value={String(issueTotal)}
          detail={issueTotal > 0 ? copy.warning : copy.success}
          badgeClass={issueTotal > 0 ? statusTone("WARNING") : statusTone("SUCCESS")} loading={statusLoading} />
      </section>

      <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] overflow-hidden">
        <div className="overflow-x-auto border-b border-[var(--border)]">
          <div role="tablist" aria-label={copy.title} className="flex min-w-max px-2 pt-2">
            {TABLES.map((item) => (
              <button key={item.key} id={`tab-${item.key}`} role="tab"
                aria-selected={activeTab === item.key} aria-controls="data-table-panel"
                type="button" onClick={() => selectTab(item.key)}
                className={`px-4 py-3 border-b-2 text-xs font-mono font-semibold tracking-wide transition-colors ${
                  activeTab === item.key
                    ? "border-[#00e5c4] text-[#00e5c4]"
                    : "border-transparent text-[var(--muted)] hover:text-[var(--text)]"
                }`}>
                {item.label}
              </button>
            ))}
          </div>
        </div>

        <div className="p-3 md:p-4 flex flex-col lg:flex-row lg:items-center gap-3 border-b border-[var(--border)] bg-[var(--row)]">
          <form className="flex min-w-0 flex-1 max-w-xl" onSubmit={(event) => {
            event.preventDefault();
            setPage(1);
            setSearch(searchInput.trim());
          }}>
            <label className="sr-only" htmlFor="data-search">{copy.search}</label>
            <div className="relative min-w-0 flex-1">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--subtle)]" />
              <input id="data-search" value={searchInput} onChange={(event) => setSearchInput(event.target.value)}
                placeholder={copy.search}
                className="w-full h-9 pl-9 pr-3 rounded-l-lg border border-[var(--border)] bg-[var(--input-bg)] text-sm text-[var(--text)] placeholder:text-[var(--subtle)]" />
            </div>
            <button type="submit" className="h-9 px-3 rounded-r-lg border-y border-r border-[var(--border)] bg-[var(--surface2)] text-xs font-medium text-[var(--text)] hover:bg-[var(--input-hover)]">
              {copy.searchButton}
            </button>
          </form>

          <div className="flex flex-wrap items-center gap-2">
            <details className="relative group">
              <summary className="list-none cursor-pointer h-9 inline-flex items-center gap-2 px-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] text-xs text-[var(--text)] hover:bg-[var(--input-hover)]">
                <Columns3 size={14} />
                {copy.columns}: {visibleColumns.length} {copy.visible}
              </summary>
              <div className="absolute right-0 z-30 mt-2 w-72 max-h-96 overflow-auto rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 shadow-2xl">
                <div className="flex items-center justify-between gap-2 pb-2 mb-2 border-b border-[var(--border)]">
                  <button type="button" onClick={() => table && updatePreference({ ...preference, visibleColumns: table.columns.map((column) => column.key) })}
                    className="text-xs text-[#00e5c4] hover:underline">{copy.all}</button>
                  <button type="button" onClick={() => table && updatePreference({ ...preference, visibleColumns: resolveVisibleColumns(table.columns, []) })}
                    className="text-xs text-[var(--muted)] hover:text-[var(--text)]">{copy.defaults}</button>
                </div>
                <div className="space-y-0.5">
                  {(table?.columns ?? []).map((column) => {
                    const checked = visibleSet.has(column.key);
                    return (
                      <label key={column.key} className="flex items-start gap-2.5 rounded-md px-2 py-1.5 text-xs text-[var(--text)] hover:bg-[var(--input-bg)] cursor-pointer">
                        <input type="checkbox" checked={checked} disabled={checked && visibleColumns.length === 1}
                          onChange={() => toggleColumn(column.key)} className="mt-0.5 rounded border-[var(--border)] bg-[var(--input-bg)] text-[#00e5c4] focus:ring-[#00e5c4]" />
                        <span className="min-w-0">
                          <span className="block break-words">{column.label}</span>
                          {column.sourceOnly && <span className="block text-[10px] text-[var(--subtle)]">source</span>}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            </details>

            <label className="h-9 inline-flex items-center gap-2 px-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] text-xs text-[var(--muted)]">
              <span className="hidden sm:inline">{copy.rows}</span>
              <select value={preference.pageSize} onChange={(event) => {
                const pageSize = Number(event.target.value);
                setPage(1);
                updatePreference({ ...preference, pageSize });
              }} className="border-0 bg-transparent py-0 pl-0 pr-6 text-xs text-[var(--text)] focus:ring-0">
                {[25, 50, 100, 200].map((size) => <option key={size} value={size}>{size}</option>)}
              </select>
            </label>

            <span aria-live="polite" className={`text-[10px] min-w-24 ${saveState === "error" ? "text-red-400" : "text-[var(--subtle)]"}`}>
              {saveState === "saving" ? copy.saving : saveState === "saved" ? copy.saved : saveState === "error" ? copy.saveError : ""}
            </span>
          </div>
        </div>

        {table?.context.dateFrom && (
          <div className="px-4 py-2 border-b border-[var(--border)] bg-[#00e5c4]/[0.03] text-[11px] font-mono text-[var(--muted)] flex flex-wrap gap-x-5 gap-y-1">
            <span>{copy.period}: <strong className="text-[var(--text)] font-medium">{table.context.dateFrom} — {table.context.dateTo}</strong></span>
            <span>{copy.asOf}: <strong className="text-[var(--text)] font-medium">{table.context.asOfDate}</strong></span>
          </div>
        )}

        <div id="data-table-panel" role="tabpanel" aria-labelledby={`tab-${activeTab}`} className="min-h-80">
          {loading ? (
            <div className="h-80 flex flex-col items-center justify-center gap-3 text-sm text-[var(--muted)]">
              <LoaderCircle size={22} className="animate-spin text-[#00e5c4]" />
              {copy.loading}
            </div>
          ) : error ? (
            <div role="alert" className="h-80 flex flex-col items-center justify-center gap-3 px-5 text-center">
              <AlertTriangle size={24} className="text-amber-400" />
              <p className="text-sm text-[var(--muted)] max-w-xl">{error}</p>
              <button type="button" onClick={() => setReloadVersion((value) => value + 1)}
                className="px-3 py-2 rounded-lg border border-[var(--border)] text-xs text-[var(--text)] hover:bg-[var(--input-hover)]">{copy.retry}</button>
            </div>
          ) : table && table.rows.length === 0 ? (
            <div className="h-80 flex items-center justify-center px-5 text-sm text-[var(--muted)] text-center">{copy.empty}</div>
          ) : visibleColumns.length === 0 ? (
            <div className="h-80 flex items-center justify-center px-5 text-sm text-[var(--muted)] text-center">{copy.noColumns}</div>
          ) : (
            <div className="overflow-auto max-h-[62vh]">
              <table className="w-full min-w-max border-collapse text-xs">
                <thead className="sticky top-0 z-10 bg-[var(--surface2)]">
                  <tr>
                    {visibleColumns.map((column) => {
                      const sortable = activeTab === "product_yml" || activeTab === "zavod_api"
                        ? column.key === "rowNumber"
                        : !column.sourceOnly;
                      const sorted = preference.sortColumn === column.key;
                      return (
                        <th key={column.key} scope="col" className="border-b border-r last:border-r-0 border-[var(--border)] px-3 py-2.5 text-left font-semibold text-[var(--muted)] whitespace-nowrap">
                          <button type="button" disabled={!sortable} onClick={() => sortBy(column)}
                            className="inline-flex items-center gap-1.5 disabled:cursor-default hover:text-[var(--text)] disabled:hover:text-inherit">
                            {column.label}
                            {sorted && (preference.sortDirection === "asc" ? <ArrowUp size={11} /> : <ArrowDown size={11} />)}
                          </button>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {table?.rows.map((row, rowIndex) => (
                    <tr key={`${table.pagination.page}-${rowIndex}`} className="border-b last:border-b-0 border-[var(--border-faint)] hover:bg-[var(--input-bg)]">
                      {visibleColumns.map((column) => (
                        <td key={column.key} className={`max-w-md border-r last:border-r-0 border-[var(--border-faint)] px-3 py-2 text-[var(--text)] ${column.type === "text" || column.type === "source" ? "text-left" : "text-right tabular-nums"}`}>
                          <span className="block truncate" title={formatTableValue(row[column.key], column.type, locale)}>
                            {formatTableValue(row[column.key], column.type, locale)}
                          </span>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {table && !loading && !error && (
          <footer className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-4 py-3 border-t border-[var(--border)] text-xs text-[var(--muted)]">
            <span>{table.pagination.totalRows.toLocaleString(locale)} {copy.records}</span>
            <div className="flex items-center gap-2">
              <button type="button" aria-label={copy.previous} title={copy.previous} disabled={page <= 1}
                onClick={() => setPage((value) => Math.max(1, value - 1))}
                className="w-8 h-8 inline-flex items-center justify-center rounded-lg border border-[var(--border)] hover:bg-[var(--input-hover)] disabled:opacity-35">
                <ChevronLeft size={14} />
              </button>
              <span className="min-w-28 text-center">{copy.page} {table.pagination.page} {copy.of} {Math.max(1, table.pagination.totalPages)}</span>
              <button type="button" aria-label={copy.next} title={copy.next}
                disabled={table.pagination.totalPages === 0 || page >= table.pagination.totalPages}
                onClick={() => setPage((value) => value + 1)}
                className="w-8 h-8 inline-flex items-center justify-center rounded-lg border border-[var(--border)] hover:bg-[var(--input-hover)] disabled:opacity-35">
                <ChevronRight size={14} />
              </button>
            </div>
          </footer>
        )}
      </section>
    </div>
  );
}

function StatusCard({
  label,
  value,
  detail,
  badgeClass,
  loading,
}: {
  label: string;
  value: string;
  detail: string;
  badgeClass?: string;
  loading: boolean;
}) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 min-w-0">
      <p className="text-[10px] font-mono uppercase tracking-widest text-[var(--subtle)] mb-2">{label}</p>
      {loading ? (
        <div className="h-8 flex items-center"><LoaderCircle size={15} className="animate-spin text-[var(--muted)]" /></div>
      ) : (
        <>
          <p className="text-sm font-medium text-[var(--text)] truncate" title={value}>{value}</p>
          <span className={`mt-2 inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-mono ${badgeClass ?? "text-[var(--muted)] border-transparent"}`}>
            {detail === "SUCCESS" && <CheckCircle2 size={10} />}
            {detail}
          </span>
        </>
      )}
    </div>
  );
}
