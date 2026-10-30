"use client";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { apiFetch } from "@/lib/fetch";
import { readApiJson } from "@/lib/api-response";
import DataQualitySummary, {
  type QualityStockGroup,
} from "./DataQualitySummary";
import ImportIssueList from "./ImportIssueList";
import {
  qualityLabel,
  qualityGuidance,
  qualityFixHref,
} from "@/lib/data-quality-copy";
import {
  readQualitySelection,
  writeQualitySelection,
} from "@/lib/data-quality-navigation";
interface Row {
  id: string;
  sku: string;
  name: string;
  productKind: string;
  brandKey: string;
  issues: string[];
  ageReference: { date: string | null; basis: string };
  sourceId: string;
  observedAt: string | null;
  importRunId: string;
  sourceRecordKey: string;
}
interface Quality extends Record<string, unknown> {
  rows: Row[];
  pagination: { page: number; pageSize: number; totalRows: number };
  summary: (QualityStockGroup & { code: string })[];
  affectedStock: QualityStockGroup[];
  brands: Array<{ id: string; name: string }>;
  aliases: Array<{
    value: string;
    brandId: string;
    name: string;
    revision: number;
  }>;
  components: Array<{
    component: string;
    currency: string | null;
    lineCount: number;
    revenue: string | null;
    missingAmountCount: number;
  }>;
  stock?: Array<{
    brandKey: string;
    currency: string | null;
    quantity: string | null;
    costValue: string | null;
  }>;
  orderExceptions?: Array<{
    code: string;
    sourceSku: string | null;
    orderId: string;
    lineId: string;
  }>;
  normalizationReplayRequired: number;
}
/** Tenant diagnostics and explicit corrections reuse Settings tokens and the authenticated API. */
export default function DataQualityCard({
  lang,
  canManage,
  revision = 0,
}: {
  lang: "uk" | "en";
  canManage: boolean;
  revision?: number;
}) {
  const uk = lang === "uk",
    locale = uk ? "uk-UA" : "en-GB";
  const [data, setData] = useState<Quality | null>(null),
    [page, setPage] = useState(1),
    [q, setQ] = useState(""),
    [search, setSearch] = useState(""),
    [code, setCode] = useState(""),
    [loading, setLoading] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const [alias, setAlias] = useState(""),
    [brandId, setBrandId] = useState(""),
    [dirty, setDirty] = useState(false);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const requestId = useRef(0),
    productListRef = useRef<HTMLHeadingElement>(null),
    focusProducts = useRef(false);
  useEffect(() => {
    if (data && !loading && focusProducts.current) {
      focusProducts.current = false;
      productListRef.current?.focus();
    }
  }, [data, loading]);
  useEffect(() => {
    const read = () => {
      const selection = readQualitySelection(
        new URLSearchParams(location.search),
      );
      setCode(selection.code);
      setSearch(selection.q);
      setQ(selection.q);
      setPage(selection.page);
    };
    read();
    window.addEventListener("popstate", read);
    return () => window.removeEventListener("popstate", read);
  }, []);
  /** Apply diagnostic navigation without replacing unrelated Settings URL state. */
  function select(nextCode: string, nextPage = 1, nextSearch = search) {
    setCode(nextCode);
    setPage(nextPage);
    setSearch(nextSearch);
    const url = new URL(location.href);
    url.search = writeQualitySelection(url.searchParams, {
      code: nextCode,
      q: nextSearch,
      page: nextPage,
    }).toString();
    history.replaceState(null, "", url);
  }
  const load = useCallback(
    async (signal?: AbortSignal) => {
      const id = ++requestId.current;
      setLoading(true);
      try {
        const response = await apiFetch(
          `/api/data/quality?page=${page}&q=${encodeURIComponent(search)}&code=${encodeURIComponent(code)}`,
          { signal, cache: "no-store" },
        );
        const result = await readApiJson<Quality>(response);
        if (!response.ok || !Array.isArray(result.rows))
          throw new Error("QUALITY_UNAVAILABLE");
        if (!signal?.aborted && id === requestId.current) setData(result);
      } catch (error) {
        if (!signal?.aborted && id === requestId.current) throw error;
      } finally {
        if (!signal?.aborted && id === requestId.current) setLoading(false);
      }
    },
    [page, search, code],
  );
  useEffect(() => {
    const c = new AbortController();
    setError("");
    load(c.signal).catch(() => {
      if (!c.signal.aborted)
        setError(
          uk
            ? "Не вдалося завантажити якість даних. Спробуйте ще раз."
            : "Could not load data quality. Try again.",
        );
    });
    return () => {
      c.abort();
      requestId.current++;
    };
  }, [load, uk, revision]);
  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  /** Persist an administrative change, then distinguish save failure from refresh failure. */
  async function save(body: Record<string, unknown>) {
    setBusy(true);
    setError("");
    setMessage("");
    let saved = false;
    try {
      const response = await apiFetch("/api/data/quality", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) throw new Error("SAVE_FAILED");
      saved = true;
      if (body.action === "alias") {
        setDirty(false);
        setAlias("");
        setBrandId("");
      }
      await load();
      setMessage(
        body.action === "alias"
          ? uk
            ? "Аліас збережено. Оновіть каталог, щоб застосувати його до товарів."
            : "Alias saved. Refresh the catalog to apply it to products."
          : uk
            ? "Тип товару збережено."
            : "Product type saved.",
      );
    } catch {
      setError(
        saved
          ? uk
            ? "Зміни збережено, але діагностику не оновлено. Натисніть «Оновити діагностику»."
            : "Changes saved, but diagnostics could not refresh. Select Refresh diagnostics."
          : uk
            ? "Не вдалося зберегти зміни. Перевірте вибір і повторіть спробу."
            : "Could not save changes. Check the selection and try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  const label = (code: string) => qualityLabel(code, lang);
  const kindLabel = (kind: string) =>
    ({
      UNKNOWN: uk ? "Не підтверджено" : "Unverified",
      MERCHANDISE: uk ? "Товар" : "Merchandise",
      SERVICE: uk ? "Послуга" : "Service",
      GIFT_CARD: uk ? "Сертифікат" : "Gift card",
    })[kind] ?? kind;
  const value = (amount: string | null, currency: string | null) =>
    amount === null
      ? uk
        ? "Немає даних"
        : "Unavailable"
      : `${Number(amount).toLocaleString(locale, { maximumFractionDigits: 2 })} ${currency ?? (uk ? "валюта невідома" : "currency unknown")}`;
  const control =
    "min-w-0 rounded-lg border border-(--border) bg-(--surface) px-3 py-2 text-sm text-(--text) focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--text)";
  const button =
    control +
    " touch-manipulation disabled:opacity-50 disabled:cursor-not-allowed hover:bg-(--bg)";
  return (
    <section
      className="mb-10 rounded-xl border border-(--border) bg-(--surface) p-5"
      aria-labelledby="data-quality-title"
      aria-busy={busy || loading}
    >
      <h2 id="data-quality-title" className="font-semibold text-(--text)">
        {uk ? "Якість даних" : "Data quality"}
      </h2>
      <p className="mt-1 text-sm text-(--muted)">
        {uk
          ? "Проблеми поточного каталогу з прив’язкою до товарів. Послуги й сертифікати не входять у товарний сток або класифікацію."
          : "Current catalog exceptions linked to products. Services and gift cards are excluded from merchandise stock and classification."}
      </p>
      {error && (
        <p
          ref={errorRef}
          tabIndex={-1}
          role="alert"
          className="mt-3 text-sm text-red-500"
        >
          {error}
        </p>
      )}
      <p role="status" className="mt-3 text-sm text-(--muted)">
        {message ||
          (loading || !data ? (uk ? "Завантаження…" : "Loading…") : "")}
      </p>
      <button
        type="button"
        className={button}
        disabled={busy || loading}
        onClick={() => {
          setError("");
          load().catch(() =>
            setError(
              uk
                ? "Не вдалося оновити дані. Спробуйте ще раз."
                : "Could not refresh data. Try again.",
            ),
          );
        }}
      >
        {uk ? "Оновити діагностику" : "Refresh diagnostics"}
      </button>
      {data && (
        <>
          <DataQualitySummary
            summary={data.summary}
            affectedStock={data.affectedStock ?? []}
            lang={lang}
            selected={code}
            onSelect={(c) => {
              focusProducts.current = true;
              select(c);
            }}
          />
          <ImportIssueList lang={lang} revision={revision} />
          {data.stock
            ?.filter((row) => row.brandKey === "UNBRANDED")
            .map((row) => (
              <p
                key={row.currency ?? "unknown"}
                className="mt-3 text-sm text-(--text)"
              >
                {uk
                  ? "Без бренду · товарний залишок"
                  : "Unbranded · merchandise stock"}
                :{" "}
                {row.quantity === null
                  ? uk
                    ? "невідомо"
                    : "unknown"
                  : Number(row.quantity).toLocaleString(locale)}{" "}
                · {value(row.costValue, row.currency)}
              </p>
            ))}
          <h3 className="mt-6 font-medium text-(--text)">
            {uk ? "Рухи за типом" : "Movement components"}
          </h3>
          <p className="mt-1 text-sm text-(--muted)">
            {uk
              ? "Усі збережені поточні рядки замовлень. Це перевірка нормалізації, а не фінансовий звіт за період. Суми без підтвердженої дати не включено."
              : "All retained current order lines. This checks normalization, not a period financial report. Amounts without a verified date are excluded."}
          </p>
          {data.normalizationReplayRequired > 0 && (
            <p className="mt-2 text-sm text-(--text)">
              {uk
                ? "Повторіть історичний імпорт для застосування нових правил до старих рядків:"
                : "Replay history to apply the new rules to older lines:"}{" "}
              {data.normalizationReplayRequired.toLocaleString(locale)}
            </p>
          )}
          {data.components.map((c) => (
            <p
              key={`${c.component}:${c.currency}`}
              className="mt-2 text-sm text-(--text)"
            >
              {c.component === "RETURNS_CORRECTIONS"
                ? uk
                  ? "Повернення та коригування"
                  : "Returns and corrections"
                : kindLabel(c.component)}
              : {value(c.revenue, c.currency)} ·{" "}
              {c.lineCount.toLocaleString(locale)} {uk ? "рядків" : "lines"};{" "}
              {uk ? "неповні суми" : "missing amounts"}:{" "}
              {c.missingAmountCount.toLocaleString(locale)}
            </p>
          ))}
          {Boolean(data.orderExceptions?.length) && (
            <details className="mt-4 text-sm text-(--text)">
              <summary className="cursor-pointer focus-visible:outline-solid">
                {uk ? "Рядки замовлень для перевірки" : "Order lines to review"}
              </summary>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                {data.orderExceptions?.map((row, i) => (
                  <li
                    key={`${row.orderId}:${row.lineId}:${row.code}:${i}`}
                    className="wrap-break-word"
                  >
                    {row.sourceSku ?? (uk ? "SKU невідомий" : "Unknown SKU")}:{" "}
                    {label(row.code)} · {uk ? "замовлення" : "order"}{" "}
                    {row.orderId}
                  </li>
                ))}
              </ul>
            </details>
          )}
          <h3
            ref={productListRef}
            tabIndex={-1}
            className="mt-6 font-semibold scroll-mt-6 focus-visible:outline-solid"
          >
            {code
              ? `${uk ? "Проблема" : "Issue"}: ${label(code)}`
              : uk
                ? "Товари"
                : "Products"}
          </h3>
          <form
            className="mt-6 flex flex-wrap items-end gap-2"
            onSubmit={(e: FormEvent) => {
              e.preventDefault();
              select(code, 1, q);
            }}
          >
            <label className="min-w-0 flex-1 text-sm text-(--muted)">
              {uk ? "Пошук SKU або назви" : "Search SKU or name"}
              <input
                name="quality-search"
                autoComplete="off"
                maxLength={200}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                className={control + " mt-1 block w-full"}
              />
            </label>
            <button disabled={busy || loading} className={button}>
              {uk ? "Знайти" : "Search"}
            </button>
          </form>
          <div className="mt-4 space-y-4">
            {data.rows.map((row) => (
              <article
                key={row.id}
                className="border-t border-(--border) pt-3 text-sm"
              >
                <p className="wrap-break-word font-medium text-(--text)">
                  {row.name} · <span translate="no">{row.sku}</span>
                </p>
                <p className="mt-1 text-(--muted)">
                  {row.brandKey === "UNBRANDED"
                    ? uk
                      ? "Без бренду"
                      : "Unbranded"
                    : row.brandKey}
                </p>
                {row.issues.length > 0 && (
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-(--muted)">
                    {row.issues.map((code) => (
                      <li key={code}>
                        {label(code)}
                        <p>{qualityGuidance(code, lang)}</p>
                        <a
                          className="inline-flex min-h-11 items-center underline focus-visible:outline-solid"
                          href={qualityFixHref(code)}
                        >
                          {uk ? "Де виправити" : "Where to fix"}
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
                {row.ageReference.basis === "FIRST_SALE_PROXY" && (
                  <p className="mt-2 text-(--muted)">
                    {uk
                      ? "Перше підтверджене замовлення як орієнтир віку, не дата надходження:"
                      : "First verified sale as an age proxy, not a receipt date:"}{" "}
                    {row.ageReference.date &&
                      new Date(row.ageReference.date).toLocaleDateString(
                        locale,
                      )}
                  </p>
                )}
                {canManage ? (
                  <label className="mt-2 flex flex-wrap items-center gap-2 text-(--muted)">
                    {uk ? "Тип товару" : "Product type"}
                    <select
                      aria-label={`${uk ? "Тип товару" : "Product type"} ${row.sku}`}
                      value={row.productKind}
                      disabled={busy || loading}
                      onChange={(e) =>
                        save({
                          action: "productKind",
                          skuId: row.id,
                          productKind: e.target.value,
                        })
                      }
                      className={control}
                    >
                      {["UNKNOWN", "MERCHANDISE", "SERVICE", "GIFT_CARD"].map(
                        (kind) => (
                          <option key={kind} value={kind}>
                            {kindLabel(kind)}
                          </option>
                        ),
                      )}
                    </select>
                  </label>
                ) : (
                  <p className="mt-2 text-(--muted)">
                    {kindLabel(row.productKind)}
                  </p>
                )}
                <details className="mt-2 text-(--muted)">
                  <summary className="cursor-pointer focus-visible:outline-solid">
                    {uk ? "Походження даних" : "Data lineage"}
                  </summary>
                  <p className="mt-1 break-all">
                    {uk ? "Джерело" : "Source"}: {row.sourceId}
                    <br />
                    {uk ? "Спостереження" : "Observed"}:{" "}
                    {row.observedAt ? new Date(row.observedAt).toLocaleString(locale) : (uk ? "Не підтверджено" : "Unverified")}
                    <br />
                    {uk ? "Імпорт" : "Import"}: {row.importRunId}
                    <br />
                    {uk ? "Запис джерела" : "Source record"}:{" "}
                    {row.sourceRecordKey}
                  </p>
                </details>
              </article>
            ))}
          </div>
          {!data.rows.length && (
            <p className="mt-3 text-sm text-(--muted)">
              {uk
                ? "Товарів за цією проблемою або пошуком немає. Скиньте фільтри, щоб переглянути каталог."
                : "No products match this issue or search. Clear filters to review the catalog."}
            </p>
          )}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button
              className={button}
              disabled={page === 1 || busy || loading}
              onClick={() => select(code, page - 1)}
            >
              {uk ? "Назад" : "Previous"}
            </button>
            <span className="text-sm text-(--muted)">
              {page.toLocaleString(locale)} /{" "}
              {Math.max(
                1,
                Math.ceil(data.pagination.totalRows / 25),
              ).toLocaleString(locale)}
            </span>
            <button
              className={button}
              disabled={
                page * 25 >= data.pagination.totalRows || busy || loading
              }
              onClick={() => select(code, page + 1)}
            >
              {uk ? "Далі" : "Next"}
            </button>
          </div>
          <h3 className="mt-6 font-medium text-(--text)">
            {uk ? "Аліаси брендів" : "Brand aliases"}
          </h3>
          <p className="mt-1 text-sm text-(--muted)">
            {uk
              ? "Регістр і зовнішні пробіли нормалізуються автоматично. Додайте інше написання й виберіть бренд; потім оновіть каталог."
              : "Case and outer whitespace normalize automatically. Map another spelling to a brand, then refresh the catalog."}
          </p>
          {data.aliases.map((a) => (
            <div
              key={a.value}
              className="mt-2 flex flex-wrap items-center gap-2 text-sm text-(--text)"
            >
              <span translate="no" className="wrap-break-word">
                {a.value} → {a.name}
              </span>
              {canManage && (
                <button
                  className={button}
                  disabled={busy || loading}
                  onClick={() =>
                    save({ action: "alias", alias: a.value, brandId: null })
                  }
                  aria-label={`${uk ? "Прибрати аліас" : "Remove alias"} ${a.value}`}
                >
                  {uk ? "Прибрати" : "Remove"}
                </button>
              )}
            </div>
          ))}
          {canManage && (
            <form
              className="mt-3 flex flex-wrap items-end gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                save({ action: "alias", alias, brandId });
              }}
            >
              <label className="min-w-0 flex-1 text-sm text-(--muted)">
                {uk ? "Написання у джерелі" : "Source spelling"}
                <input
                  name="brand-alias"
                  disabled={busy || loading}
                  autoComplete="off"
                  required
                  maxLength={200}
                  value={alias}
                  onChange={(e) => {
                    setAlias(e.target.value);
                    setDirty(true);
                  }}
                  className={control + " mt-1 block w-full"}
                />
              </label>
              <label className="min-w-0 flex-1 text-sm text-(--muted)">
                {uk ? "Бренд" : "Brand"}
                <select
                  disabled={busy || loading}
                  required
                  value={brandId}
                  onChange={(e) => {
                    setBrandId(e.target.value);
                    setDirty(true);
                  }}
                  className={control + " mt-1 block w-full"}
                >
                  <option value="">
                    {uk ? "Виберіть бренд" : "Choose a brand"}
                  </option>
                  {data.brands.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </label>
              <button className={button} disabled={busy || loading}>
                {busy
                  ? uk
                    ? "Збереження…"
                    : "Saving…"
                  : uk
                    ? "Зберегти аліас"
                    : "Save alias"}
              </button>
            </form>
          )}
        </>
      )}
    </section>
  );
}
