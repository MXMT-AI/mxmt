"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useLang } from "@/components/LanguageProvider";
import { apiFetch } from "@/lib/fetch";
import { readApiJson } from "@/lib/api-response";
import { formatTableValue } from "@/lib/data-reporting-ui";
import type { DataColumnMetadata } from "@/lib/data-table-api";
import type { PublishedSalesReport } from "@/lib/sales-report";
import type { SalesView } from "@/lib/sales-report-view";
import ReportTable from "./ReportTable";
type ResponseData = Omit<
  PublishedSalesReport,
  "articles" | "brands" | "categories" | "channels"
> & {
  view: SalesView;
  table: {
    columns: DataColumnMetadata[];
    rows: Array<Record<string, unknown>>;
    pagination: { page: number; totalPages: number; totalRows: number };
  };
  oneOffOrderCount: number;
};
const control =
  "rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50 touch-manipulation aria-pressed:border-[var(--text)] aria-pressed:font-semibold";
const field = "mt-1 block w-full " + control;
const ukColumns: Record<string, string> = {
  name: "Назва",
  revenueDelta: "Зміна виручки",
  unitsDelta: "Зміна одиниць",
  lyCoveredGrossProfit: "Покритий валовий прибуток LY",
  lyGmPct: "Покрита маржа LY",
  currency: "Валюта",
  revenue: "Чиста виручка",
  units: "Одиниці товару",
  orderCount: "Замовлення-продажі",
  returnOrderCount: "Замовлення-повернення",
  coveredGrossProfit: "Валовий прибуток покритих рядків",
  coveredRevenue: "Виручка покритих рядків",
  gmPct: "Маржа покритих рядків",
  lyRevenue: "Виручка LY за ті самі дати",
  revenueChangePct: "Виручка проти LY",
  missingProfitCount: "Рядки без прибутку",
  coverage: "Покриття прибутку",
  comparisonReason: "Доступність LY",
};
const reasons: Record<string, [string, string]> = {
  IMPORT_QUARANTINED: [
    "В імпорті є ізольовані замовлення: перевірте якість даних",
    "Import contains quarantined orders: review data quality",
  ],
  INSUFFICIENT_HISTORY: ["Недостатньо історії", "Insufficient history"],
  MISSING_REVENUE: ["Неповна виручка", "Incomplete revenue"],
  LY_NON_POSITIVE: ["LY не додатний", "LY is not positive"],
  NORMALIZATION_REPLAY_REQUIRED: [
    "Потрібен повторний імпорт історії",
    "History replay required",
  ],
  PROJECT_MAPPING_UNVERIFIED: [
    "Не підтверджено поле проєкту",
    "Project field unverified",
  ],
  RETURN_DATE_UNAVAILABLE: [
    "Невідома дата повернення",
    "Return date unavailable",
  ],
  PAYMENT_DATE_UNAVAILABLE: [
    "Невідома дата оплати",
    "Payment date unavailable",
  ],
  INFERRED_PAYMENT_DATE: [
    "Використано погоджену резервну дату",
    "Approved inferred sale date",
  ],
  PRODUCT_KIND_UNVERIFIED: [
    "Не підтверджено тип товару",
    "Product type unverified",
  ],
  CURRENCY_UNVERIFIED: ["Невідома валюта", "Currency unverified"],
  REVENUE_UNAVAILABLE: ["Невідомий дохід рядка", "Line revenue unavailable"],
  SERVICE_PROFIT_UNVERIFIED: [
    "Не погоджено прибуток послуг",
    "Service profit treatment unverified",
  ],
  OWNERSHIP_UNVERIFIED: ["Невідома власність", "Ownership unverified"],
  PREORDER_AMOUNT_UNAVAILABLE: [
    "Невідома сума передзамовлення",
    "Preorder amount unavailable",
  ],
  MISSING_COST: ["Невідома собівартість", "Cost unavailable"],
  COMMISSION_UNVERIFIED: ["Невідома комісія", "Commission unavailable"],
};
/** A single server snapshot feeds every financial view; client code only formats and navigates it. */
export default function SalesReportingWorkspace() {
  const { lang } = useLang(),
    uk = lang === "uk",
    locale = uk ? "uk-UA" : "en-GB";
  const [data, setData] = useState<ResponseData | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [view, setView] = useState<SalesView>("articles"),
    [page, setPage] = useState(1),
    [q, setQ] = useState(""),
    [search, setSearch] = useState(""),
    [sort, setSort] = useState("name"),
    [direction, setDirection] = useState<"asc" | "desc">("asc"),
    [period, setPeriod] = useState({ from: "", to: "" }),
    [applied, setApplied] = useState({ from: "", to: "" }),
    [reload, setReload] = useState(0);
  const snapshot = useRef<string | null>(null),
    errorRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    const c = new AbortController();
    setBusy(true);
    setError("");
    const params = new URLSearchParams({
      view,
      page: String(page),
      q: search,
      sort,
      direction,
    });
    if (snapshot.current) params.set("calculationRunId", snapshot.current);
    else if (applied.from || applied.to) {
      params.set("dateFrom", applied.from);
      params.set("dateTo", applied.to);
    }
    apiFetch(`/api/data/sales?${params}`, {
      signal: c.signal,
      cache: "no-store",
    })
      .then(async (response) => {
        const body = await readApiJson<ResponseData & { code?: string }>(
          response,
        );
        if (!response.ok) throw new Error(body.code ?? "UNAVAILABLE");
        if (!c.signal.aborted) {
          snapshot.current = body.calculationRunId;
          setData(body);
          setPeriod({ from: body.period.from, to: body.period.to });
        }
      })
      .catch((cause) => {
        if (!c.signal.aborted) {
          setError(cause instanceof Error ? cause.message : "UNAVAILABLE");
        }
      })
      .finally(() => {
        if (!c.signal.aborted) setBusy(false);
      });
    return () => c.abort();
  }, [view, page, search, sort, direction, applied, reload]);
  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);
  const text = (code: string) => reasons[code]?.[uk ? 0 : 1] ?? code;
  const fmt = (
    v: unknown,
    type: "money" | "percentage" | "quantity" | "number" = "money",
  ) => formatTableValue(v, type, locale);
  const apply = (e: FormEvent) => {
    e.preventDefault();
    if (!period.from || !period.to || period.from > period.to) {
      setError("INVALID_REPORT_PERIOD");
      return;
    }
    snapshot.current = null;
    setPage(1);
    setApplied({ ...period });
    setReload((n) => n + 1);
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
  const exportParams = data
    ? new URLSearchParams({
        view,
        calculationRunId: data.calculationRunId,
        q: search,
        sort,
        direction,
        format: "csv",
      })
    : null;
  const columns =
    data?.table.columns.map((c) => ({
      ...c,
      label: uk ? (ukColumns[c.key] ?? c.label) : c.label,
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
        <h1 className="text-2xl font-semibold text-[var(--text)]">
          {uk ? "Продажі та маржа SalesDrive" : "SalesDrive sales and margin"}
        </h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          {uk
            ? "Продажі за датою оплати, повернення за підтвердженою датою. Валюти показано окремо."
            : "Sales by payment date and returns by verified return date. Currencies remain separate."}
        </p>
      </header>
      <form onSubmit={apply} className="flex flex-wrap items-end gap-3">
        <label className="text-sm text-[var(--muted)]">
          {uk ? "Дата від" : "Date from"}
          <input
            name="sales-from"
            type="date"
            className={field}
            value={period.from}
            onChange={(e) => setPeriod((p) => ({ ...p, from: e.target.value }))}
          />
        </label>
        <label className="text-sm text-[var(--muted)]">
          {uk ? "Дата до" : "Date to"}
          <input
            name="sales-to"
            type="date"
            className={field}
            value={period.to}
            onChange={(e) => setPeriod((p) => ({ ...p, to: e.target.value }))}
          />
        </label>
        <button className={control} disabled={busy}>
          {busy
            ? uk
              ? "Розрахунок…"
              : "Calculating…"
            : uk
              ? "Застосувати період"
              : "Apply period"}
        </button>
        <button
          type="button"
          className={control}
          disabled={busy}
          onClick={() => {
            snapshot.current = null;
            setReload((n) => n + 1);
          }}
        >
          {uk ? "Оновити розрахунок" : "Refresh calculation"}
        </button>
      </form>
      {busy && (
        <p role="status" className="text-sm text-[var(--muted)]">
          {uk ? "Завантаження…" : "Loading…"}
        </p>
      )}
      {error && (
        <p
          ref={errorRef}
          tabIndex={-1}
          role="alert"
          className="text-sm text-red-500"
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
          <a className="underline" href="/settings">
            {uk ? "Налаштування" : "Settings"}
          </a>
        </p>
      )}
      {data && !busy && !error && (
        <>
          <p className="text-sm text-[var(--muted)]">
            {data.period.from} — {data.period.to} · LY {data.period.lyFrom} —{" "}
            {data.period.lyTo}
            {(!data.history.current || !data.history.ly) && (
              <span className="block text-[var(--text)] font-medium">
                {uk
                  ? "Історія неповна або вхідні дані потребують перевірки. Порівняння LY недоступне."
                  : "History is incomplete or inputs require review. LY comparison is unavailable."}
              </span>
            )}
          </p>
          <div className="space-y-3">
            {data.summary.map((row) => (
              <section
                key={row.currency ?? "unknown"}
                className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4"
                aria-label={
                  row.currency ?? (uk ? "Невідома валюта" : "Unknown currency")
                }
              >
                <h2 className="font-semibold text-[var(--text)]">
                  {row.currency ??
                    (uk ? "Невідома валюта" : "Unknown currency")}
                </h2>
                <dl className="mt-3 grid grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
                  {[
                    [
                      uk ? "Чиста виручка" : "Net revenue",
                      fmt(row.current.revenue),
                    ],
                    [
                      uk ? "Замовлення-продажі" : "Sale orders",
                      fmt(row.current.orderCount, "number"),
                    ],
                    [
                      uk ? "Замовлення-повернення" : "Return orders",
                      fmt(row.current.returnOrderCount, "number"),
                    ],
                    [
                      uk ? "Одиниці товару" : "Merchandise units",
                      fmt(row.current.units, "quantity"),
                    ],
                    [
                      uk
                        ? "Валовий прибуток покритих рядків"
                        : "Covered gross profit",
                      fmt(row.current.coveredGrossProfit),
                    ],
                    [
                      uk ? "Маржа покритих рядків" : "Covered GM",
                      fmt(row.current.gmPct, "percentage"),
                    ],
                    [
                      uk ? "Виручка покритих рядків" : "Covered revenue",
                      fmt(row.current.coveredRevenue),
                    ],
                    [
                      uk
                        ? "Виконання місячного плану"
                        : "Monthly plan attainment",
                      fmt(row.plan.attainmentPct, "percentage"),
                    ],
                    [
                      uk
                        ? "Темп проти плану за дні періоду"
                        : "Pace against period-day target",
                      fmt(row.plan.pacePct, "percentage"),
                    ],
                  ].map(([label, value]) => (
                    <div key={label}>
                      <dt className="text-[var(--muted)]">{label}</dt>
                      <dd className="mt-1 font-semibold tabular-nums text-[var(--text)]">
                        {value}
                      </dd>
                    </div>
                  ))}
                </dl>
                {row.coveredMarginBelowTarget !== null && (
                  <p className="mt-3 text-sm text-[var(--text)]">
                    {uk ? "Маржа покритих рядків" : "Covered margin"}:{" "}
                    {row.coveredMarginBelowTarget
                      ? uk
                        ? "нижче порогу"
                        : "below target"
                      : uk
                        ? "не нижче порогу"
                        : "at or above target"}{" "}
                    {fmt(row.marginTargetPct, "percentage")}.
                  </p>
                )}
                {["PLAN_UNSET", "PLAN_CURRENCY_UNAVAILABLE"].includes(
                  row.plan.reason ?? "",
                ) && (
                  <a
                    className="mt-3 block text-sm text-[var(--text)] underline focus-visible:outline"
                    href="/settings?tab=merchandising"
                  >
                    {uk ? "Задати план і валюту" : "Set plan and currency"}
                  </a>
                )}
                {row.current.coverage !== "COMPLETE" && (
                  <p className="mt-3 text-sm text-[var(--text)] font-medium">
                    {uk
                      ? "Часткові дані. Рядків без відомого прибутку:"
                      : "Partial data. Lines without known profit:"}{" "}
                    {row.current.missingProfitCount};{" "}
                    {uk ? "без відомої виручки:" : "without known revenue:"}{" "}
                    {row.current.missingRevenueCount}.
                  </p>
                )}
              </section>
            ))}
          </div>
          <nav
            aria-label={uk ? "Фінансові зрізи" : "Financial views"}
            className="flex flex-wrap gap-2"
          >
            {Object.entries(labels).map(([key, label]) => (
              <button
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
              </button>
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
            <label className="min-w-0 flex-1 text-sm text-[var(--muted)]">
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
            <button className={control}>{uk ? "Знайти" : "Search"}</button>
            {exportParams && (
              <a className={control} href={`/api/data/sales?${exportParams}`}>
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
                setDirection(
                  sort === c.key && direction === "asc" ? "desc" : "asc",
                );
                setSort(c.key);
              }}
            />
          ) : (
            <p className="text-sm text-[var(--muted)]">
              {uk
                ? "Немає рядків за цими фільтрами."
                : "No rows match these filters."}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-3 text-sm text-[var(--muted)]">
            <button
              type="button"
              className={control}
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              {uk ? "Назад" : "Previous"}
            </button>
            <span>
              {page} / {Math.max(1, data.table.pagination.totalPages)} ·{" "}
              {data.table.pagination.totalRows}
            </span>
            <button
              type="button"
              className={control}
              disabled={page >= data.table.pagination.totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              {uk ? "Далі" : "Next"}
            </button>
          </div>
          <details className="rounded-xl border border-[var(--border)] p-4 text-sm text-[var(--muted)]">
            <summary className="cursor-pointer focus-visible:outline">
              {uk
                ? "Компоненти, передзамовлення й винятки"
                : "Components, preorders and exceptions"}
            </summary>
            <div className="mt-3 space-y-3">
              <p>
                {uk
                  ? "Послуги входять у виручку, але їх прибуток не підтверджений. Gift card та невідомі типи показано окремо."
                  : "Services enter revenue with unverified profit. Gift cards and unknown product types remain separate."}
              </p>
              {data.components
                .filter((c) => c.current.lineCount)
                .map((c) => (
                  <p key={`${c.id}:${c.currency}`}>
                    {
                      (
                        {
                          MERCHANDISE: uk ? "Товари" : "Merchandise",
                          SERVICE: uk ? "Послуги" : "Services",
                          GIFT_CARD: "Gift card",
                          UNKNOWN: uk ? "Невідомий тип" : "Unknown type",
                        } as Record<string, string>
                      )[c.id]
                    }{" "}
                    · {c.currency ?? "—"}: {fmt(c.current.revenue)}
                  </p>
                ))}
              {data.preorders
                .filter((p) => p.lineCount)
                .map((p) => (
                  <p key={p.currency ?? "unknown"}>
                    {uk
                      ? "Оплачені передзамовлення, окремо від продажів"
                      : "Paid preorders, separate from sales"}{" "}
                    · {p.currency ?? "—"}: {fmt(p.paidAmount)}
                  </p>
                ))}
              <p>
                {uk
                  ? "Разових замовлень LY понад 50% місячної виручки бренду:"
                  : "LY orders exceeding 50% of monthly brand revenue:"}{" "}
                {data.oneOffOrderCount}
              </p>
              {data.oneOffOrders.map((o, i) => (
                <p key={i}>
                  {o.period === "ly"
                    ? "LY"
                    : uk
                      ? "Поточний період"
                      : "Current"}{" "}
                  · {o.month} · {o.orderId} · {o.currency ?? "—"} ·{" "}
                  {fmt(o.revenue)} · {fmt(o.shareOfLy, "percentage")} LY
                </p>
              ))}
              {data.issues.map((issue) => (
                <p key={issue.code}>
                  {text(issue.code)}: {issue.count}
                </p>
              ))}
            </div>
          </details>
          <p className="break-all text-xs text-[var(--muted)]">
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
