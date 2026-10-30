"use client";
import { useEffect, useState } from "react";
import { useRouter } from "@/i18n/navigation";

import { Link } from "@/i18n/navigation";
import { apiFetch } from "@/lib/fetch";
import { readApiJson } from "@/lib/api-response";
import { sheetsMappingMessage } from "@/lib/sheets-mapping-copy";
import { Field, control } from "@/components/merchandising/FormControls";
import {
  SHEETS_PRODUCT_FIELDS,
  SHEETS_ORDER_FIELDS,
  SHEETS_EVENT_KINDS,
  type SheetsFieldMapping,
  type SheetsMappingMetadata,
  type SheetsMappingPreview,
} from "@/lib/sheets-mapping-contract";
import type { ReportingSources } from "@/lib/reporting-source-contract";
const labels: Record<string, [string, string]> = {
  productId: ["ID товару", "Product ID"],
  sku: ["Артикул", "SKU"],
  name: ["Назва", "Name"],
  brand: ["Бренд", "Brand"],
  category: ["Категорія", "Category"],
  barcode: ["Штрихкод", "Barcode"],
  retailPrice: ["Роздрібна ціна", "Retail price"],
  costPrice: ["Собівартість одиниці", "Unit cost"],
  quantity: ["Кількість", "Quantity"],
  inTransit: ["У дорозі", "In transit"],
  observedAt: ["Час спостереження залишку", "Stock observation time"],
  orderId: ["ID замовлення", "Order ID"],
  lineId: ["ID рядка замовлення", "Order line ID"],
  statusId: ["Статус", "Status"],
  channelId: ["Канал", "Channel"],
  orderedAt: ["Час замовлення", "Order time"],
  paidAt: ["Дата оплати", "Payment date"],
  returnedAt: ["Дата повернення", "Return date"],
  updatedAt: ["Час зміни", "Update time"],
  salesAmount: ["Сума продажу", "Sales amount"],
  costAmount: ["Собівартість продажу", "Sales cost"],
  UNKNOWN: ["Не підтверджено", "Unverified"],
  SALE: ["Продаж", "Sale"],
  RETURN: ["Повернення", "Return"],
  CORRECTION: ["Коригування", "Correction"],
  PREORDER: ["Передзамовлення", "Preorder"],
  REFUSAL: ["Відмова", "Refusal"],
  MERCHANDISE: ["Товар", "Merchandise"],
  SERVICE: ["Послуга", "Service"],
  GIFT_CARD: ["Подарунковий сертифікат", "Gift card"],
};
const errors: Record<string, [string, string]> = {
  INVALID_SHEETS_MAPPING: [
    "Перевірте валюту, обов’язкові поля, дати подій та одиниці сум.",
    "Check currency, required fields, event dates and amount units.",
  ],
  SHEETS_RAW_IMPORT_REQUIRED: [
    "Спочатку успішно імпортуйте таблицю в «Дані та звіти».",
    "Import the workbook successfully in Data & Reports first.",
  ],
  SHEETS_RAW_IMPORT_CHANGED: [
    "Імпорт змінився. Завантажте зіставлення знову.",
    "The import changed. Reload the mapping.",
  ],
  SHEETS_MAPPING_REVISION_CONFLICT: [
    "Є новіша версія. Завантажте зіставлення знову.",
    "A newer revision exists. Reload the mapping.",
  ],
  SHEETS_MAPPING_PREVIEW_EXPIRED: [
    "Термін preview минув. Перевірте зіставлення ще раз.",
    "The preview expired. Preview the mapping again.",
  ],
  SHEETS_MAPPING_HAS_BLOCKING_ERRORS: [
    "Спочатку усуньте блокувальні помилки.",
    "Resolve blocking errors before approval.",
  ],
};
export default function SheetsMappingCard({
  lang,
  canManage,
}: {
  lang: "uk" | "en";
  canManage: boolean;
}) {
  const uk = lang === "uk",
    index = uk ? 0 : 1,
    router = useRouter();
  const [sources, setSources] = useState<ReportingSources["connections"]>([]),
    [sourceId, setSourceId] = useState(""),
    [meta, setMeta] = useState<SheetsMappingMetadata | null>(null),
    [draft, setDraft] = useState<SheetsFieldMapping | null>(null),
    [preview, setPreview] = useState<SheetsMappingPreview | null>(null);
  const [sourcesLoading, setSourcesLoading] = useState(true),
    [loading, setLoading] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [reference, setReference] = useState(""),
    [confirmed, setConfirmed] = useState(false),
    [reload, setReload] = useState(0);
  const caption = (key: string) => labels[key]?.[index] ?? key;
  const errorText = (body: Record<string, unknown>) =>
    errors[String(body.code)]?.[index] ??
    (uk
      ? "Не вдалося обробити зіставлення. Перевірте джерело та спробуйте ще раз."
      : "Could not process mapping. Check the source and retry.");
  useEffect(() => {
    if (!canManage) return;
    const abort = new AbortController();
    setSourcesLoading(true);
    apiFetch("/api/connectors/source", { signal: abort.signal })
      .then(async (r) => {
        const data = await readApiJson(r);
        if (!r.ok) throw Error();
        if (!abort.signal.aborted)
          setSources(
            (data as unknown as ReportingSources).connections.filter(
              (c) => c.provider === "sheets",
            ),
          );
      })
      .catch(() => {
        if (!abort.signal.aborted)
          setError(
            uk
              ? "Не вдалося завантажити таблиці."
              : "Could not load spreadsheets.",
          );
      })
      .finally(() => {
        if (!abort.signal.aborted) setSourcesLoading(false);
      });
    return () => abort.abort();
  }, [canManage, uk]);
  useEffect(() => {
    setMeta(null);
    setDraft(null);
    setPreview(null);
    setReference("");
    setConfirmed(false);
    setMessage("");
    if (!sourceId) {
      setLoading(false);
      return;
    }
    const abort = new AbortController();
    setLoading(true);
    setError("");
    apiFetch(`/api/connectors/sheets/mapping/${encodeURIComponent(sourceId)}`, {
      signal: abort.signal,
    })
      .then(async (r) => {
        const data = await readApiJson(r);
        if (!r.ok) throw Error(errorText(data));
        if (!abort.signal.aborted) {
          const value = data as unknown as SheetsMappingMetadata;
          setMeta(value);
          setDraft(value.suggestion);
        }
      })
      .catch((e) => {
        if (!abort.signal.aborted)
          setError(e instanceof Error ? e.message : "Mapping unavailable");
      })
      .finally(() => {
        if (!abort.signal.aborted) setLoading(false);
      });
    return () => abort.abort();
  }, [sourceId, reload, uk]);
  function edit(update: (value: SheetsFieldMapping) => void) {
    setDraft((old) => {
      if (!old) return old;
      const next = structuredClone(old);
      update(next);
      return next;
    });
    setPreview(null);
    setConfirmed(false);
    setMessage("");
    setError("");
  }
  async function action(kind: "preview" | "approve") {
    if (!meta || !draft) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const body =
        kind === "preview"
          ? {
              expectedRevision: meta.revision,
              importRunId: meta.input.importRunId,
              mapping: draft,
            }
          : {
              configId: preview?.configId,
              previewHash: preview?.previewHash,
              reference,
            };
      const response = await apiFetch(
        `/api/connectors/sheets/mapping/${encodeURIComponent(sourceId)}/${kind}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      const data = await readApiJson(response);
      if (!response.ok) throw Error(errorText(data));
      if (kind === "preview") {
        const result = data as unknown as SheetsMappingPreview;
        setPreview(result);
        setMeta((old) =>
          old
            ? {
                ...old,
                revision: result.revision,
                observed: {
                  statuses: Object.entries(result.summary.statusCounts).map(
                    ([id, count]) => ({ id, count }),
                  ),
                  channels: Object.entries(result.summary.channelCounts).map(
                    ([id, count]) => ({ id, count }),
                  ),
                  categories: Object.entries(result.summary.categoryCounts).map(
                    ([name, count]) => ({ name, count }),
                  ),
                },
              }
            : old,
        );
        setConfirmed(false);
      } else {
        setPreview(null);
        setConfirmed(false);
        setMessage(
          uk
            ? "Зіставлення погоджено. Вибір джерела та імпорт у спільну модель виконуються окремо."
            : "Mapping approved. Source selection and shared-model import are separate actions.",
        );
        window.dispatchEvent(new Event("connector-connection-changed"));
        router.refresh();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Mapping unavailable");
    } finally {
      setBusy(false);
    }
  }
  if (!canManage) return null;
  const productColumns =
      meta?.input.sheets.find((s) => s.sheetKey === "product_yml")?.columns ??
      [],
    orderColumns =
      meta?.input.sheets.find((s) => s.sheetKey === "zavod_api")?.columns ?? [];
  return (
    <section className="mb-10 min-w-0 rounded-xl border border-(--border) bg-(--surface) p-5">
      <h2 className="font-semibold text-(--text)">
        {uk
          ? "Google Sheets · зіставлення даних"
          : "Google Sheets · data mapping"}
      </h2>
      <p className="mt-1 mb-4 text-sm text-(--muted)">
        {uk
          ? "Перевірте поля й бізнес-правила на збереженому імпорті. Попередній перегляд і погодження не змінюють джерело звітів та не запускають розрахунки."
          : "Review fields and business rules against a saved import. Preview and approval do not switch reporting source or calculate reports."}
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <Field label={uk ? "Збережена таблиця" : "Saved spreadsheet"}>
          <select
            className={control}
            value={sourceId}
            disabled={busy || loading || sourcesLoading || sources.length === 0}
            onChange={(e) => setSourceId(e.target.value)}
          >
            <option value="">
              {uk ? "Виберіть таблицю" : "Select spreadsheet"}
            </option>
            {sources.map((s) => (
              <option key={s.sourceId} value={s.sourceId}>
                {s.accountHost}
              </option>
            ))}
          </select>
        </Field>
        {sourceId ? (
          <button
            className={control + " w-auto"}
            type="button"
            disabled={busy || loading}
            onClick={() => setReload((n) => n + 1)}
          >
            {uk ? "Завантажити знову" : "Reload mapping"}
          </button>
        ) : null}
      </div>
      {sourcesLoading ? (
        <p role="status" className="mt-3 text-sm">
          {uk ? "Завантажуємо таблиці…" : "Loading spreadsheets…"}
        </p>
      ) : !sources.length && !error ? (
        <p className="mt-3 text-sm text-(--muted)">
          {uk
            ? "Збережених таблиць ще немає. Спочатку імпортуйте Google Sheets у "
            : "No saved spreadsheets yet. Import Google Sheets in "}
          <Link className="underline" href="/data-reporting">
            {uk ? "Дані та звіти" : "Data & Reports"}
          </Link>
          .
        </p>
      ) : null}
      {loading ? (
        <p role="status" className="mt-3">
          {uk ? "Завантажуємо поля…" : "Loading fields…"}
        </p>
      ) : null}
      {meta && draft ? (
        <fieldset disabled={busy || loading} className="mt-5 min-w-0 space-y-5">
          <legend className="text-sm text-(--muted)">
            {uk ? "Імпорт" : "Import"}:{" "}
            {new Date(meta.input.importedAt).toLocaleString(
              uk ? "uk-UA" : "en-GB",
            )}{" "}
            · {uk ? "Версія" : "Revision"} {meta.revision} ·{" "}
            {meta.input.timezone}
          </legend>
          {(["products", "orders"] as const).map((resource) => (
            <details
              key={resource}
              open
              className="rounded-lg border border-(--border) p-3"
            >
              <summary className="cursor-pointer font-medium">
                {resource === "products" ? "Product YML 2.0" : "ZAVOD_API"}
              </summary>
              <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {(resource === "products"
                  ? SHEETS_PRODUCT_FIELDS
                  : SHEETS_ORDER_FIELDS
                ).map((field) => (
                  <Field key={field} label={caption(field)}>
                    <select
                      className={control}
                      value={
                        (draft[resource] as Record<string, string | null>)[
                          field
                        ] ?? ""
                      }
                      onChange={(e) =>
                        edit((v) => {
                          (v[resource] as Record<string, string | null>)[
                            field
                          ] = e.target.value || null;
                        })
                      }
                    >
                      <option value="">
                        {uk ? "Не задано" : "Not mapped"}
                      </option>
                      {(resource === "products" ? productColumns : orderColumns)
                        .filter((c) => c.label)
                        .map((c) => (
                          <option key={c.key} value={c.key}>
                            {c.label} ({c.key.replace("col_", "").toUpperCase()}
                            )
                          </option>
                        ))}
                    </select>
                  </Field>
                ))}
              </div>
            </details>
          ))}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Field label={uk ? "Валюта (ISO 4217)" : "Currency (ISO 4217)"}>
              <input
                className={control}
                name="sheets-currency"
                autoComplete="off"
                maxLength={3}
                placeholder="UAH"
                value={draft.policy.currency}
                onChange={(e) =>
                  edit((v) => {
                    v.policy.currency = e.target.value.toUpperCase();
                  })
                }
              />
            </Field>
            <Field label={uk ? "Сума після знижок" : "Amount after discounts"}>
              <select
                className={control}
                value={draft.policy.salesAmount}
                onChange={(e) =>
                  edit((v) => {
                    v.policy.salesAmount = e.target
                      .value as typeof v.policy.salesAmount;
                  })
                }
              >
                <option value="net_line">
                  {uk ? "За весь рядок" : "Line total"}
                </option>
                <option value="net_unit">
                  {uk ? "За одиницю" : "Per unit"}
                </option>
              </select>
            </Field>
            <Field label={uk ? "Собівартість у продажах" : "Sales cost basis"}>
              <select
                className={control}
                value={draft.policy.costAmount}
                onChange={(e) =>
                  edit((v) => {
                    v.policy.costAmount = e.target
                      .value as typeof v.policy.costAmount;
                  })
                }
              >
                <option value="line">
                  {uk ? "За весь рядок" : "Line total"}
                </option>
                <option value="unit">{uk ? "За одиницю" : "Per unit"}</option>
                <option value="unavailable">
                  {uk ? "Не підтверджена" : "Unverified"}
                </option>
              </select>
            </Field>
            <Field
              label={
                uk ? "Ідентичність рядка замовлення" : "Order line identity"
              }
            >
              <select
                className={control}
                value={draft.policy.lineIdentity}
                onChange={(e) =>
                  edit((v) => {
                    v.policy.lineIdentity = e.target
                      .value as typeof v.policy.lineIdentity;
                  })
                }
              >
                <option value="column">
                  {uk ? "Окрема колонка ID рядка" : "Dedicated line-ID column"}
                </option>
                <option value="order_product">
                  {uk
                    ? "Унікальна пара замовлення / товар"
                    : "Unique order / product pair"}
                </option>
              </select>
            </Field>
            <Field
              label={
                uk ? "Час спостереження залишків" : "Stock observation basis"
              }
            >
              <select
                className={control}
                value={draft.policy.stockObservation}
                onChange={(e) =>
                  edit((v) => {
                    v.policy.stockObservation = e.target
                      .value as typeof v.policy.stockObservation;
                  })
                }
              >
                <option value="unverified">
                  {uk ? "Не підтверджено" : "Unverified"}
                </option>
                <option value="column">
                  {uk ? "З колонки часу" : "Timestamp column"}
                </option>
                <option value="import_observation">
                  {uk
                    ? "Поточне спостереження під час імпорту"
                    : "Current observation during import"}
                </option>
              </select>
            </Field>
            <Field
              label={
                uk ? "Тип позицій за замовчуванням" : "Default product kind"
              }
            >
              <select
                className={control}
                value={draft.policy.defaultProductKind}
                onChange={(e) =>
                  edit((v) => {
                    v.policy.defaultProductKind = e.target
                      .value as typeof v.policy.defaultProductKind;
                  })
                }
              >
                <option value="UNKNOWN">{caption("UNKNOWN")}</option>
                <option value="MERCHANDISE">{caption("MERCHANDISE")}</option>
              </select>
            </Field>
          </div>
          {draft.policy.stockObservation !== "unverified" ? (
            <Field
              label={
                uk
                  ? "Підстава підтвердження часу залишків"
                  : "Stock timestamp evidence reference"
              }
            >
              <input
                className={control}
                name="stock-observation-reference"
                autoComplete="off"
                maxLength={1000}
                value={draft.policy.stockReference}
                onChange={(e) =>
                  edit((v) => {
                    v.policy.stockReference = e.target.value;
                  })
                }
              />
            </Field>
          ) : null}
          <fieldset className="space-y-3">
            <legend className="font-medium">
              {uk ? "Статуси джерела" : "Source statuses"}
            </legend>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {[
                ...new Set([
                  ...Object.keys(draft.policy.statuses),
                  ...meta.observed.statuses.map((s) => s.id),
                ]),
              ]
                .sort()
                .map((status) => (
                  <Field
                    key={status}
                    label={uk ? `Статус ${status}` : `Status ${status}`}
                  >
                    <select
                      className={control}
                      value={draft.policy.statuses[status] ?? "UNKNOWN"}
                      onChange={(e) =>
                        edit((v) => {
                          v.policy.statuses[status] = e.target
                            .value as (typeof v.policy.statuses)[string];
                        })
                      }
                    >
                      {SHEETS_EVENT_KINDS.map((kind) => (
                        <option key={kind} value={kind}>
                          {caption(kind)}
                        </option>
                      ))}
                    </select>
                  </Field>
                ))}
            </div>
            <p className="text-sm text-(--muted)">
              {uk
                ? "Непідтверджені статуси виключаються з фінансових показників. Дата зміни рядка не є підтвердженою датою повернення."
                : "Unverified statuses are excluded from financial metrics. A row update timestamp does not prove a return date."}
            </p>
          </fieldset>
          {meta.observed.channels.length ? (
            <fieldset>
              <legend className="font-medium">
                {uk ? "Канали" : "Channels"}
              </legend>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {meta.observed.channels.map((channel) => (
                  <Field
                    key={channel.id}
                    label={uk ? `Канал ${channel.id}` : `Channel ${channel.id}`}
                  >
                    <input
                      className={control}
                      autoComplete="off"
                      maxLength={200}
                      value={draft.policy.channels[channel.id] ?? ""}
                      onChange={(e) =>
                        edit((v) => {
                          if (e.target.value)
                            v.policy.channels[channel.id] = e.target.value;
                          else delete v.policy.channels[channel.id];
                        })
                      }
                    />
                  </Field>
                ))}
              </div>
            </fieldset>
          ) : null}
          {meta.observed.categories.length ? (
            <details className="rounded-lg border border-(--border) p-3">
              <summary className="cursor-pointer font-medium">
                {uk
                  ? "Типи позицій за категоріями"
                  : "Product kinds by category"}
              </summary>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {meta.observed.categories.map((category) => (
                  <Field key={category.name} label={category.name}>
                    <select
                      className={control}
                      value={
                        Object.hasOwn(draft.policy.productKinds, category.name)
                          ? draft.policy.productKinds[category.name]
                          : ""
                      }
                      onChange={(e) =>
                        edit((v) => {
                          if (e.target.value)
                            Object.defineProperty(
                              v.policy.productKinds,
                              category.name,
                              {
                                value: e.target.value,
                                enumerable: true,
                                configurable: true,
                                writable: true,
                              },
                            );
                          else delete v.policy.productKinds[category.name];
                        })
                      }
                    >
                      <option value="">
                        {uk ? "За замовчуванням" : "Use default"}
                      </option>
                      {["UNKNOWN", "MERCHANDISE", "SERVICE", "GIFT_CARD"].map(
                        (kind) => (
                          <option key={kind} value={kind}>
                            {caption(kind)}
                          </option>
                        ),
                      )}
                    </select>
                  </Field>
                ))}
              </div>
            </details>
          ) : null}
          <button
            type="button"
            className={control + " w-auto"}
            disabled={!draft.policy.currency}
            onClick={() => void action("preview")}
          >
            {busy
              ? uk
                ? "Перевіряємо…"
                : "Checking…"
              : uk
                ? "Перевірити зіставлення"
                : "Preview mapping"}
          </button>
        </fieldset>
      ) : null}
      {preview ? (
        <section
          className="mt-5 space-y-3 rounded-lg border border-(--border) p-4"
          aria-label={uk ? "Результат перевірки" : "Preview results"}
        >
          <h3 className="font-medium">
            {uk ? "Перевірка зіставлення" : "Mapping preview"}
          </h3>
          <p>
            {uk ? "Товарів" : "Products"}: {preview.summary.counts.products} ·{" "}
            {uk ? "Рядків замовлень" : "Order lines"}:{" "}
            {preview.summary.counts.orders}
          </p>
          <p>
            {uk ? "Рядків із зауваженнями" : "Rows needing review"}:{" "}
            {preview.summary.invalidRows.products} /{" "}
            {preview.summary.invalidRows.orders}
          </p>
          <p className="text-sm text-(--muted)">
            {uk
              ? "Немає підтвердження повноти історії, типу власності та умов постачальників. Невідомі показники не замінюються нулями."
              : "History completeness, ownership and supplier terms require separate evidence. Unknown metrics are not replaced with zero."}
          </p>
          {preview.summary.blockingErrors.length ? (
            <ul role="alert" className="text-sm text-red-500">
              {preview.summary.blockingErrors.map((code) => (
                <li key={code}>{sheetsMappingMessage(code, lang)}</li>
              ))}
            </ul>
          ) : null}
          <ul className="space-y-1 text-sm text-(--muted)">
            {preview.summary.warnings.map((code) => (
              <li key={code}>{sheetsMappingMessage(code, lang)}</li>
            ))}
          </ul>
          <p className="text-sm">
            {uk
              ? "Непідтверджених статусів / типів позицій"
              : "Unverified statuses / product kinds"}
            : {preview.summary.unmappedStatuses} /{" "}
            {preview.summary.unverifiedProductKinds}
          </p>
          <details>
            <summary className="cursor-pointer">
              {uk ? "Зауваження" : "Issues"} ({preview.summary.problemCount})
            </summary>
            <ul className="mt-2 max-h-64 overflow-auto text-sm">
              {preview.summary.problems.map((problem, i) => (
                <li key={i}>
                  {problem.resource === "products"
                    ? uk
                      ? "Товари"
                      : "Products"
                    : uk
                      ? "Замовлення"
                      : "Orders"}{" "}
                  · {uk ? "рядок" : "row"} {problem.row} ·{" "}
                  {problem.field ? caption(problem.field) + " · " : ""}
                  {sheetsMappingMessage(problem.code, lang)}
                </li>
              ))}
            </ul>
            <p className="mt-2 text-sm text-(--muted)">
              {uk
                ? "Показано до 100 прикладів; кількість вище — за всіма перевіреними рядками."
                : "Up to 100 examples are shown; totals cover every inspected row."}
            </p>
          </details>
          <Field label={uk ? "Підстава погодження" : "Approval reference"}>
            <input
              className={control}
              name="sheets-mapping-approval-reference"
              autoComplete="off"
              maxLength={1000}
              value={reference}
              disabled={busy}
              onChange={(e) => setReference(e.target.value)}
            />
          </Field>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-1"
              checked={confirmed}
              disabled={busy}
              onChange={(e) => setConfirmed(e.target.checked)}
            />
            {uk
              ? "Я перевірив(ла) поля, статуси, дати, одиниці сум і наведені обмеження."
              : "I reviewed fields, statuses, dates, amount units and the stated limitations."}
          </label>
          <button
            type="button"
            className={control + " w-auto"}
            disabled={
              busy ||
              !confirmed ||
              !reference.trim() ||
              preview.summary.blockingErrors.length > 0
            }
            onClick={() => void action("approve")}
          >
            {uk ? "Погодити цю версію" : "Approve this revision"}
          </button>
        </section>
      ) : null}
      {error ? (
        <p role="alert" className="mt-3 text-sm text-red-500">
          {error}
        </p>
      ) : null}
      <p role="status" className="mt-3 text-sm text-(--muted)">
        {message}
      </p>
    </section>
  );
}
