"use client";
import { Link } from "@/i18n/navigation";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import PrimaryBrandCreator from "./PrimaryBrandCreator";
import { apiFetch } from "@/lib/fetch";
import { readApiJson } from "@/lib/api-response";
import {
  defaultClientSettings,
  type SettingsResource,
} from "@/lib/merchandising-settings";
interface Entity extends Record<string, unknown> {
  id: string;
  name: string;
  revision: number;
}
interface Payload extends Record<string, unknown> {
  client: {
    id: string | null;
    revision: number;
    values: ReturnType<typeof defaultClientSettings>;
  };
  items: Entity[];
  pagination: { page: number; totalRows: number };
  brands: Array<{ id: string; name: string }>;
  suppliers: Array<{ id: string; name: string }>;
}
function currentKyivMonth() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Kyiv",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(new Date());
  return `${parts.find((p) => p.type === "year")?.value}-${parts.find((p) => p.type === "month")?.value}`;
}
const inputClass =
  "mt-1 block w-full min-w-0 rounded-lg border border-(--border) bg-(--surface) px-3 py-2 text-sm text-(--text) focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--text)";
const buttonClass =
  "touch-manipulation rounded-lg border border-(--border) px-3 py-2 text-sm text-(--text) hover:bg-(--bg) focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--text) disabled:cursor-not-allowed disabled:opacity-50";
/** Shared labelled control keeps server field errors adjacent to their input. */
function Field({
  name,
  label,
  error,
  children,
}: {
  name: string;
  label: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="min-w-0">
      <label htmlFor={`merch-${name}`} className="text-sm text-(--muted)">
        {label}
      </label>
      {children}
      {error && (
        <p id={`merch-error-${name}`} className="mt-1 text-sm text-red-500">
          {error}
        </p>
      )}
    </div>
  );
}
/** Browse existing tenant entities and edit one versioned settings record at a time. */
export default function MerchandisingSettingsCard({
  lang,
  canManage,
  onDirtyChange,
}: {
  lang: "uk" | "en";
  canManage: boolean;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const uk = lang === "uk";
  const [resource, setResource] = useState<SettingsResource>("client"),
    [page, setPage] = useState(1),
    [query, setQuery] = useState(""),
    [search, setSearch] = useState(""),
    [selected, setSelected] = useState(""),
    [data, setData] = useState<Payload | null>(null),
    [error, setError] = useState(""),
    [dirty, setDirty] = useState(false),
    [loading, setLoading] = useState(false),
    [notice, setNotice] = useState("");
  const load = useCallback(
    async (signal?: AbortSignal) => {
      const response = await apiFetch(
        `/api/settings/merchandising?resource=${resource}&page=${page}&q=${encodeURIComponent(search)}`,
        { signal, cache: "no-store" },
      );
      const result = await readApiJson<Payload>(response);
      if (!response.ok || !result.client)
        throw new Error("SETTINGS_UNAVAILABLE");
      setData(result);
    },
    [resource, page, search],
  );
  useEffect(() => {
    const c = new AbortController();
    setLoading(true);
    setError("");
    load(c.signal)
      .catch(() => {
        if (!c.signal.aborted)
          setError(
            uk
              ? "Не вдалося завантажити налаштування. Спробуйте ще раз."
              : "Could not load settings. Try again.",
          );
      })
      .finally(() => {
        if (!c.signal.aborted) setLoading(false);
      });
    return () => c.abort();
  }, [load, uk]);
  useEffect(() => {
    onDirtyChange?.(dirty);
    return () => onDirtyChange?.(false);
  }, [dirty, onDirtyChange]);
  useEffect(() => {
    if (dirty) setNotice("");
  }, [dirty]);
  const leave = () =>
    !dirty ||
    window.confirm(
      uk ? "Є незбережені зміни. Відкинути їх?" : "Discard unsaved changes?",
    );
  const labels: Record<SettingsResource, string> = uk
    ? {
        client: "Клієнт",
        brand: "Бренди",
        sku: "SKU",
        supplier: "Постачальники",
        category: "Категорії",
      }
    : {
        client: "Client",
        brand: "Brands",
        sku: "SKUs",
        supplier: "Suppliers",
        category: "Categories",
      };
  const item =
    selected === "new"
      ? null
      : (data?.items.find((row) => row.id === selected) ??
        data?.items[0] ??
        null);
  return (
    <section
      aria-labelledby="merchandising-settings-title"
      className="rounded-xl border border-(--border) bg-(--surface) p-5"
    >
      <h2
        id="merchandising-settings-title"
        className="font-semibold text-(--text)"
      >
        {uk ? "Правила мерчандайзингу" : "Merchandising rules"}
      </h2>
      <p className="mt-1 text-sm text-(--muted)">
        {uk
          ? "Налаштування клієнта, власності й постачання. Зміни зберігаються з версією та журналом."
          : "Client, ownership and supply policies. Changes retain revisions and an audit trail."}
      </p>
      <nav
        aria-label={uk ? "Розділи мерчандайзингу" : "Merchandising sections"}
        className="mt-4 flex flex-wrap gap-2"
      >
        {Object.entries(labels).map(([key, label]) => (
          <button
            key={key}
            type="button"
            aria-pressed={resource === key}
            className={
              buttonClass + (resource === key ? " bg-(--bg)" : "")
            }
            onClick={() => {
              if (key !== resource && leave()) {
                setDirty(false);
                setNotice("");
                setData(null);
                setSelected("");
                setPage(1);
                setSearch("");
                setQuery("");
                setResource(key as SettingsResource);
              }
            }}
          >
            {label}
          </button>
        ))}
      </nav>
      {notice && (
        <p role="status" className="mt-3 text-sm text-(--muted)">
          {notice}
        </p>
      )}
      {error && (
        <p role="alert" className="mt-3 text-sm text-red-500">
          {error}
        </p>
      )}
      {loading && (
        <p role="status" className="mt-3 text-sm text-(--muted)">
          {uk ? "Завантаження…" : "Loading…"}
        </p>
      )}
      {resource !== "client" && (
        <form
          className="mt-4 flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (leave()) {
              setDirty(false);
              setSelected("");
              setPage(1);
              setSearch(query);
            }
          }}
        >
          <label className="min-w-0 flex-1 text-sm text-(--muted)">
            {uk ? "Пошук назви або SKU" : "Search name or SKU"}
            <input
              className={inputClass}
              name="merch-search"
              autoComplete="off"
              maxLength={200}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <button className={buttonClass}>{uk ? "Знайти" : "Search"}</button>
        </form>
      )}
      {data && !loading && (
        <>
          {resource !== "client" && (
            <div className="mt-4 flex flex-wrap items-end gap-2">
              <label className="min-w-0 flex-1 text-sm text-(--muted)">
                {labels[resource]}
                <select
                  className={inputClass}
                  value={selected === "new" ? "new" : (item?.id ?? "")}
                  onChange={(e) => {
                    if (leave()) {
                      setDirty(false);
                      setSelected(e.target.value);
                    }
                  }}
                >
                  {selected === "new" && (
                    <option value="new">
                      {uk ? "Новий постачальник" : "New supplier"}
                    </option>
                  )}
                  {!data.items.length && selected !== "new" && (
                    <option value="">
                      {uk ? "Немає записів" : "No records"}
                    </option>
                  )}
                  {data.items.map((row) => (
                    <option key={row.id} value={row.id}>
                      {String(row.sku ?? row.name)}
                      {row.sku ? ` · ${row.name}` : ""}
                    </option>
                  ))}
                </select>
              </label>
              {resource === "supplier" && canManage && (
                <button
                  type="button"
                  className={buttonClass}
                  onClick={() => {
                    if (leave()) {
                      setDirty(false);
                      setSelected("new");
                    }
                  }}
                >
                  {uk ? "Додати постачальника" : "Add supplier"}
                </button>
              )}
            </div>
          )}
          {resource === "client" || item || selected === "new" ? (
            <SettingsEditor
              key={`${resource}:${item?.id ?? "new"}:${resource === "client" ? data.client.revision : (item?.revision ?? 0)}`}
              lang={lang}
              canManage={canManage}
              resource={resource}
              item={item}
              data={data}
              onDirty={setDirty}
              onSaved={async (id, newName) => {
                setDirty(false);
                if (id) setSelected(id);
                if (newName && (page !== 1 || search !== newName)) {
                  setPage(1);
                  setQuery(newName);
                  setSearch(newName);
                } else await load();
                setNotice(
                  uk
                    ? "Збережено. Нові імпорти застосують статуси й виключення; звіти очікують перерахунку."
                    : "Saved. New imports apply status/exclusion rules; reports await recalculation.",
                );
              }}
            />
          ) : (
            <p className="mt-4 text-sm text-(--muted)">
              {uk
                ? "Записів ще немає. Імпортуйте каталог, щоб налаштувати бренди, товари й категорії."
                : "No records yet. Import a catalog to configure brands, products and categories."}
            </p>
          )}
          {resource !== "client" && (
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button
                className={buttonClass}
                disabled={page === 1}
                onClick={() => {
                  if (leave()) {
                    setDirty(false);
                    setSelected("");
                    setPage((p) => p - 1);
                  }
                }}
              >
                {uk ? "Назад" : "Previous"}
              </button>
              <span className="text-sm text-(--muted)">
                {page} /{" "}
                {Math.max(1, Math.ceil(data.pagination.totalRows / 25))}
              </span>
              <button
                className={buttonClass}
                disabled={page * 25 >= data.pagination.totalRows}
                onClick={() => {
                  if (leave()) {
                    setDirty(false);
                    setSelected("");
                    setPage((p) => p + 1);
                  }
                }}
              >
                {uk ? "Далі" : "Next"}
              </button>
            </div>
          )}
        </>
      )}
      <p className="mt-5 text-sm text-(--muted)">
        <Link
          href="/settings?tab=general#data-quality-title"
          className="underline focus-visible:outline-solid"
        >
          {uk
            ? "Аліаси брендів і типи товарів — у «Якість даних»."
            : "Brand aliases and product types are managed in Data quality."}
        </Link>
      </p>
    </section>
  );
}
/** One explicit save publishes a revision; drafts never change the active server policy. */
function SettingsEditor({
  lang,
  canManage,
  resource,
  item,
  data,
  onDirty,
  onSaved,
}: {
  lang: "uk" | "en";
  canManage: boolean;
  resource: SettingsResource;
  item: Entity | null;
  data: Payload;
  onDirty: (value: boolean) => void;
  onSaved: (id: string | null, newName?: string) => Promise<void>;
}) {
  const uk = lang === "uk",
    client = resource === "client",
    revision = client ? data.client.revision : (item?.revision ?? 0);
  const initial: Record<string, unknown> = client
    ? { ...structuredClone(data.client.values) }
    : resource === "brand"
      ? {
          ownership: item?.ownership ?? "UNKNOWN",
          commissionPct:
            item?.commissionPct == null ? null : Number(item.commissionPct),
          supplierId: item?.supplierId ?? null,
        }
      : resource === "sku"
        ? {
            ownershipOverride: item?.ownershipOverride ?? null,
            commissionPct:
              item?.commissionOverridePct == null
                ? null
                : Number(item.commissionOverridePct),
            supplierId: item?.supplierId ?? null,
          }
        : resource === "supplier"
          ? {
              name: item?.name ?? "",
              leadDays: item?.leadTimeDays ?? data.client.values.leadDays,
              coverDays: item?.coverDays ?? data.client.values.coverDays,
              moq: item?.moq ?? data.client.values.moq,
            }
          : {
              seasonMonths: item?.seasonMonths ?? [
                1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12,
              ],
            };
  const [createdBrands, setCreatedBrands] = useState<
    Array<{ id: string; name: string }>
  >([]);
  const [creationKey] = useState(() => crypto.randomUUID());
  const [listDrafts, setListDrafts] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      ["saleStatuses", "excludedChannels", "excludedProjects"].map((key) => [
        key,
        ((initial[key] ?? []) as string[]).join(", "),
      ]),
    ),
  );
  const [values, setValues] = useState(initial),
    [dirty, setDirty] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [fields, setFields] = useState<Record<string, string>>({});
  const [planMonth, setPlanMonth] = useState(currentKyivMonth);
  const errorRef = useRef<HTMLParagraphElement>(null),
    formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    onDirty(dirty);
    return () => onDirty(false);
  }, [dirty, onDirty]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  useEffect(() => {
    if (error) {
      const invalid = formRef.current?.querySelector<HTMLElement>(
        '[aria-invalid="true"]',
      );
      (invalid ?? errorRef.current)?.focus();
    }
  }, [error, fields]);
  const edit = (name: string, value: unknown) => {
    setValues((v) => ({ ...v, [name]: value }));
    setDirty(true);
    setFields((f) => ({ ...f, [name]: "" }));
  };
  const fieldError = (name: string) => {
    const error = fields[name];
    if (!error) return undefined;
    if (error.startsWith("range:")) {
      const [, min, max] = error.split(":");
      return uk
        ? `Вкажіть число від ${min} до ${max}.`
        : `Enter a number between ${min} and ${max}.`;
    }
    if (error === "above_healthy")
      return uk
        ? "Поріг ризику має бути більшим за поріг здорового запасу."
        : "The risk threshold must exceed the healthy threshold.";
    if (error === "currency_required" || error === "invalid_currency")
      return uk
        ? "Вкажіть трилітерний код валюти планів, наприклад UAH."
        : "Enter a three-letter plan currency code, for example UAH.";
    if (error === "project_field_required")
      return uk
        ? "Вкажіть підтверджене поле ID проєкту в SalesDrive."
        : "Enter the verified SalesDrive project-ID field.";
    if (error === "commission_requires_consignment")
      return uk
        ? "Комісія задається для стоку на реалізації."
        : "Commission applies to consignment stock.";
    if (error === "invalid_months")
      return uk
        ? "Виберіть хоча б один місяць сезону."
        : "Select at least one season month.";
    return uk ? "Перевірте значення цього поля." : "Check this field value.";
  };
  const attrs = (name: string) => ({
    id: `merch-${name}`,
    name,
    disabled: !canManage || busy,
    "aria-invalid": Boolean(fields[name]),
    "aria-describedby": fields[name] ? `merch-error-${name}` : undefined,
    className: inputClass,
  });
  const number = (
    name: string,
    label: string,
    min: number,
    max: number,
    step = "1",
    nullable = false,
  ) => (
    <Field key={name} name={name} label={label} error={fieldError(name)}>
      <input
        {...attrs(name)}
        type="number"
        min={min}
        max={max}
        step={step}
        value={values[name] == null ? "" : String(values[name])}
        onChange={(e) =>
          edit(
            name,
            e.target.value === ""
              ? nullable
                ? null
                : ""
              : Number(e.target.value),
          )
        }
      />
    </Field>
  );
  const ids = (name: string, label: string) => (
    <Field key={name} name={name} label={label} error={fieldError(name)}>
      <input
        {...attrs(name)}
        autoComplete="off"
        value={listDrafts[name] ?? ""}
        onChange={(e) => {
          setListDrafts((v) => ({ ...v, [name]: e.target.value }));
          edit(
            name,
            e.target.value
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean),
          );
        }}
      />
    </Field>
  );
  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setFields({});
    let saved = false;
    try {
      const response = await apiFetch("/api/settings/merchandising", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save",
          resource,
          id: client ? null : (item?.id ?? null),
          expectedRevision: revision,
          values,
          ...(resource === "supplier" && !item ? { creationKey } : {}),
        }),
      });
      const result = await readApiJson<{
        fields?: Record<string, string>;
        code?: string;
        id?: string | null;
      }>(response);
      if (!response.ok) {
        if (result.fields) setFields(result.fields);
        throw new Error(result.code ?? "SAVE_FAILED");
      }
      saved = true;
      setDirty(false);
      await onSaved(
        result.id ?? null,
        resource === "supplier" && !item ? String(values.name) : undefined,
      );
    } catch (cause) {
      setError(
        saved
          ? uk
            ? "Зміни збережено, але список не оновився. Перезавантажте налаштування."
            : "Changes saved, but the list could not refresh. Reload settings."
          : cause instanceof Error && cause.message === "SETTINGS_CONFLICT"
            ? uk
              ? "Налаштування вже змінилися. Перезавантажте список і перевірте свої правки."
              : "Settings changed elsewhere. Reload and review your edits."
            : uk
              ? "Не вдалося зберегти. Перевірте позначені поля й повторіть спробу."
              : "Could not save. Check the marked fields and try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <form ref={formRef} className="mt-5 space-y-5" onSubmit={save} noValidate>
        <p className="text-sm text-(--muted)">
          {uk ? "Ревізія" : "Revision"}: {revision}
          {!revision &&
            (uk
              ? " · стандартні значення, ще не збережено"
              : " · defaults, not yet saved")}
        </p>
        {error && (
          <p
            ref={errorRef}
            tabIndex={-1}
            role="alert"
            className="text-sm text-red-500"
          >
            {error}
          </p>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {client ? (
            <>
              <Field
                name="profileMode"
                label={uk ? "Конфігурація брендів" : "Brand configuration"}
                error={fieldError("profileMode")}
              >
                <select
                  {...attrs("profileMode")}
                  value={String(values.profileMode)}
                  onChange={(e) => edit("profileMode", e.target.value)}
                >
                  <option value="MULTIBRAND">
                    {uk ? "Мультибренд" : "Multibrand"}
                  </option>
                  <option value="MONOBRAND">
                    {uk ? "Монобренд" : "Monobrand"}
                  </option>
                </select>
              </Field>
              <Field
                name="monoBrandId"
                label={
                  uk
                    ? "Основний бренд для монобренду"
                    : "Primary brand for monobrand"
                }
                error={fieldError("monoBrandId")}
              >
                <select
                  {...attrs("monoBrandId")}
                  value={String(values.monoBrandId ?? "")}
                  onChange={(e) => edit("monoBrandId", e.target.value || null)}
                >
                  <option value="">
                    {uk ? "Виберіть бренд" : "Choose a brand"}
                  </option>
                  {[
                    ...data.brands,
                    ...createdBrands.filter(
                      (b) =>
                        !data.brands.some((existing) => existing.id === b.id),
                    ),
                  ].map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </Field>
              {values.profileMode === "MONOBRAND" && canManage && (
                <PrimaryBrandCreator
                  lang={lang}
                  disabled={busy}
                  onCreated={(brand) => {
                    setCreatedBrands((list) => [
                      ...list.filter((b) => b.id !== brand.id),
                      brand,
                    ]);
                    edit("monoBrandId", brand.id);
                  }}
                />
              )}
              {number(
                "minMarginPct",
                uk ? "Мінімальна маржа, %" : "Minimum margin, %",
                0,
                100,
                "0.1",
              )}
              {number(
                "turnoverMonths",
                uk ? "Норма оборотності, місяців" : "Turnover target, months",
                0.01,
                120,
                "0.1",
              )}
              <Field
                name="deadDays"
                label={
                  uk ? "Поріг неліквіду, днів" : "Dead stock threshold, days"
                }
                error={fieldError("deadDays")}
              >
                <select
                  {...attrs("deadDays")}
                  value={String(values.deadDays)}
                  onChange={(e) => edit("deadDays", Number(e.target.value))}
                >
                  {[60, 90, 120].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </Field>
              {number(
                "healthyWohWeeks",
                uk ? "Здоровий запас до, тижнів" : "Healthy stock up to, weeks",
                0.01,
                520,
                "0.1",
              )}
              {number(
                "riskWohWeeks",
                uk ? "Ризик до, тижнів" : "Risk up to, weeks",
                0.01,
                520,
                "0.1",
              )}
              {number(
                "newProductWeeks",
                uk
                  ? "Карантин новинки, тижнів"
                  : "New product quarantine, weeks",
                0,
                52,
              )}
              {number(
                "leadDays",
                uk
                  ? "Стандартне плече поставки, днів"
                  : "Default supplier lead time, days",
                0,
                3650,
              )}
              {number(
                "coverDays",
                uk
                  ? "Покриття після поставки, днів"
                  : "Post-delivery coverage, days",
                0,
                3650,
              )}
              {number(
                "moq",
                uk ? "Стандартний MOQ, шт" : "Default MOQ, units",
                1,
                1000000,
              )}
              <Field
                name="planMonth"
                label={uk ? "Місяць плану" : "Plan month"}
              >
                <input
                  id="merch-planMonth"
                  name="planMonth"
                  className={inputClass}
                  type="month"
                  value={planMonth}
                  onChange={(e) => setPlanMonth(e.target.value)}
                />
              </Field>
              <Field
                name="planCurrency"
                label={
                  uk ? "Валюта планів, ISO-код" : "Plan currency, ISO code"
                }
                error={fieldError("planCurrency")}
              >
                <input
                  {...attrs("planCurrency")}
                  autoComplete="off"
                  maxLength={3}
                  value={String(values.planCurrency ?? "")}
                  onChange={(e) =>
                    edit("planCurrency", e.target.value.toUpperCase() || null)
                  }
                />
              </Field>
              <Field
                name="monthlyPlans"
                label={
                  uk
                    ? "План виручки, у валюті звітності"
                    : "Revenue plan, reporting currency"
                }
                error={fieldError("monthlyPlans")}
              >
                <input
                  {...attrs("monthlyPlans")}
                  inputMode="decimal"
                  autoComplete="off"
                  value={
                    (values.monthlyPlans as Record<string, string>)[
                      planMonth
                    ] ?? ""
                  }
                  onChange={(e) => {
                    const plans = {
                      ...(values.monthlyPlans as Record<string, string>),
                    };
                    if (e.target.value === "") delete plans[planMonth];
                    else plans[planMonth] = e.target.value;
                    edit("monthlyPlans", plans);
                  }}
                />
              </Field>
              {ids(
                "saleStatuses",
                uk
                  ? "ID статусів-продажів, через кому"
                  : "Sale status IDs, comma separated",
              )}
              <label className="flex items-center gap-2 self-end py-2 text-sm text-(--text)">
                <input
                  type="checkbox"
                  checked={Boolean(values.saleStatusesVerified)}
                  disabled={!canManage || busy}
                  onChange={(e) =>
                    edit("saleStatusesVerified", e.target.checked)
                  }
                />
                {uk
                  ? "Підтверджую значення статусів у цьому акаунті"
                  : "I confirm these statuses for this account"}
              </label>
              {ids(
                "excludedChannels",
                uk ? "Виключені ID каналів" : "Excluded channel IDs",
              )}
              {ids(
                "excludedProjects",
                uk ? "Виключені ID проєктів" : "Excluded project IDs",
              )}
              <Field
                name="projectField"
                label={
                  uk
                    ? "Підтверджене поле ID проєкту в SalesDrive"
                    : "Verified project-ID field in SalesDrive"
                }
                error={fieldError("projectField")}
              >
                <input
                  {...attrs("projectField")}
                  autoComplete="off"
                  value={String(values.projectField ?? "")}
                  onChange={(e) => edit("projectField", e.target.value || null)}
                />
              </Field>
            </>
          ) : resource === "brand" || resource === "sku" ? (
            <>
              <Field
                name={resource === "sku" ? "ownershipOverride" : "ownership"}
                label={uk ? "Власність стоку" : "Stock ownership"}
                error={fieldError(
                  resource === "sku" ? "ownershipOverride" : "ownership",
                )}
              >
                <select
                  {...attrs(
                    resource === "sku" ? "ownershipOverride" : "ownership",
                  )}
                  value={String(
                    values[
                      resource === "sku" ? "ownershipOverride" : "ownership"
                    ] ?? "INHERIT",
                  )}
                  onChange={(e) => {
                    const v = e.target.value;
                    edit(
                      resource === "sku" ? "ownershipOverride" : "ownership",
                      v === "INHERIT" ? null : v,
                    );
                    if (v === "OWN" || v === "UNKNOWN")
                      edit("commissionPct", null);
                  }}
                >
                  {resource === "sku" && (
                    <option value="INHERIT">
                      {uk ? "Успадкувати бренд" : "Inherit brand"}
                    </option>
                  )}
                  <option value="UNKNOWN">{uk ? "Невідомо" : "Unknown"}</option>
                  <option value="OWN">
                    {uk ? "Власний сток" : "Own stock"}
                  </option>
                  <option value="CONSIGNMENT">
                    {uk ? "На реалізації" : "Consignment"}
                  </option>
                </select>
              </Field>
              {number(
                "commissionPct",
                uk
                  ? "Комісія, % · порожньо — невідома або успадкована"
                  : "Commission, % · blank is unknown/inherited",
                0,
                100,
                "0.000001",
                true,
              )}
              <Field
                name="supplierId"
                label={
                  uk
                    ? resource === "sku"
                      ? "Постачальник · порожньо — успадкувати бренд"
                      : "Постачальник бренду"
                    : "Supplier · SKU blank inherits brand"
                }
                error={fieldError("supplierId")}
              >
                <select
                  {...attrs("supplierId")}
                  value={String(values.supplierId ?? "")}
                  onChange={(e) => edit("supplierId", e.target.value || null)}
                >
                  <option value="">
                    {uk ? "Не задано / успадкувати" : "Not set / inherit"}
                  </option>
                  {data.suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </Field>
            </>
          ) : resource === "supplier" ? (
            <>
              <Field
                name="name"
                label={uk ? "Назва постачальника" : "Supplier name"}
                error={fieldError("name")}
              >
                <input
                  {...attrs("name")}
                  autoComplete="off"
                  maxLength={200}
                  value={String(values.name)}
                  onChange={(e) => edit("name", e.target.value)}
                />
              </Field>
              {number(
                "leadDays",
                uk ? "Плече поставки, днів" : "Lead time, days",
                0,
                3650,
              )}
              {number(
                "coverDays",
                uk
                  ? "Покриття після поставки, днів"
                  : "Post-delivery coverage, days",
                0,
                3650,
              )}
              {number("moq", uk ? "MOQ, шт" : "MOQ, units", 1, 1000000)}
            </>
          ) : (
            <fieldset
              id="merch-seasonMonths"
              tabIndex={-1}
              aria-invalid={Boolean(fields.seasonMonths)}
              aria-describedby={
                fields.seasonMonths ? "merch-error-seasonMonths" : undefined
              }
              className="sm:col-span-2"
            >
              <legend className="text-sm text-(--muted)">
                {uk ? "Місяці сезону" : "Season months"}
              </legend>
              <div className="mt-2 flex flex-wrap gap-3">
                {Array.from({ length: 12 }, (_, i) => i + 1).map((month) => (
                  <label
                    key={month}
                    className="flex items-center gap-1 text-sm text-(--text)"
                  >
                    <input
                      type="checkbox"
                      disabled={!canManage || busy}
                      checked={(values.seasonMonths as number[]).includes(
                        month,
                      )}
                      onChange={(e) =>
                        edit(
                          "seasonMonths",
                          e.target.checked
                            ? [...(values.seasonMonths as number[]), month]
                            : (values.seasonMonths as number[]).filter(
                                (m) => m !== month,
                              ),
                        )
                      }
                    />
                    {new Date(Date.UTC(2020, month - 1, 1)).toLocaleString(
                      uk ? "uk-UA" : "en-GB",
                      { month: "short", timeZone: "UTC" },
                    )}
                  </label>
                ))}
              </div>
              {fieldError("seasonMonths") && (
                <p
                  id="merch-error-seasonMonths"
                  className="mt-2 text-sm text-red-500"
                >
                  {fieldError("seasonMonths")}
                </p>
              )}
              <button
                type="button"
                disabled={!canManage || busy}
                className={buttonClass + " mt-3"}
                onClick={() =>
                  edit("seasonMonths", [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])
                }
              >
                {uk ? "Увесь рік" : "All year"}
              </button>
            </fieldset>
          )}
        </div>
        {canManage && (
          <button className={buttonClass} disabled={busy || !dirty}>
            {busy
              ? uk
                ? "Збереження…"
                : "Saving…"
              : uk
                ? "Зберегти й застосувати"
                : "Save and apply"}
          </button>
        )}
      </form>
      {resource === "sku" && item && (
        <PolicyPreview lang={lang} skuId={item.id} canManage={canManage} />
      )}
    </>
  );
}
/** Test numbers are evaluated on the server against saved inheritance, never draft browser rules. */
function PolicyPreview({
  lang,
  skuId,
  canManage,
}: {
  lang: "uk" | "en";
  skuId: string;
  canManage: boolean;
}) {
  const uk = lang === "uk";
  const [result, setResult] = useState<Record<string, unknown> | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const [values, setValues] = useState({
    revenue: "100",
    cost: "60",
    weeklyVelocity: "7",
    stock: "10",
    inTransit: "",
  });
  async function run(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await apiFetch("/api/settings/merchandising", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "preview",
          skuId,
          inputs: {
            ...values,
            cost: values.cost || null,
            inTransit: values.inTransit || null,
            planMonth: currentKyivMonth(),
            month: Number(
              new Intl.DateTimeFormat("en", {
                timeZone: "Europe/Kyiv",
                month: "numeric",
              }).format(new Date()),
            ),
          },
        }),
      });
      const body = await readApiJson<Record<string, unknown>>(response);
      if (!response.ok) throw new Error("PREVIEW_FAILED");
      setResult(body);
    } catch {
      setError(
        uk
          ? "Не вдалося перевірити. Перевірте числа й повторіть спробу."
          : "Could not preview. Check the numbers and try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  const plan = result?.monthlyPlan as Record<string, unknown> | undefined;
  const policy = result?.policy as Record<string, unknown> | undefined,
    preview = result?.preview as Record<string, unknown> | undefined;
  return (
    <form className="mt-6 border-t border-(--border) pt-4" onSubmit={run}>
      <h3 className="font-medium text-(--text)">
        {uk ? "Перевірка збережених правил SKU" : "Check saved SKU policy"}
      </h3>
      <p className="mt-1 text-sm text-(--muted)">
        {uk
          ? "Тестовий розрахунок на введених числах. Не змінює звітів."
          : "Test calculation using entered numbers. Does not change reports."}
      </p>
      <div className="mt-3 grid grid-cols-2 gap-3">
        {Object.entries(values).map(([field, value]) => (
          <label key={field} className="text-sm text-(--muted)">
            {
              (
                {
                  revenue: uk ? "Виручка" : "Revenue",
                  cost: uk ? "Відома собівартість" : "Known cost",
                  weeklyVelocity: uk
                    ? "Швидкість, шт/тиж"
                    : "Velocity, units/week",
                  stock: uk ? "Залишок, шт" : "Stock, units",
                  inTransit: uk
                    ? "У дорозі · порожньо — невідомо"
                    : "In transit · blank is unknown",
                } as Record<string, string>
              )[field]
            }
            <input
              className={inputClass}
              name={`preview-${field}`}
              inputMode="decimal"
              value={value}
              onChange={(e) =>
                setValues((v) => ({ ...v, [field]: e.target.value }))
              }
            />
          </label>
        ))}
      </div>
      {canManage && (
        <button className={buttonClass + " mt-3"} disabled={busy}>
          {uk ? "Перевірити на сервері" : "Check on server"}
        </button>
      )}
      {error && (
        <p role="alert" className="mt-2 text-sm text-red-500">
          {error}
        </p>
      )}
      {preview && policy && (
        <div
          role="status"
          className="mt-3 space-y-1 text-sm text-(--text)"
        >
          <p>
            {uk ? "Власність" : "Ownership"}:{" "}
            {policy.ownership === "OWN"
              ? uk
                ? "Власний сток"
                : "Own stock"
              : policy.ownership === "CONSIGNMENT"
                ? uk
                  ? "На реалізації"
                  : "Consignment"
                : uk
                  ? "Невідома"
                  : "Unknown"}
          </p>
          <p>
            {uk ? "Валовий прибуток" : "Gross profit"}:{" "}
            {String(
              preview.grossProfit ?? (uk ? "Недоступний" : "Unavailable"),
            )}
          </p>
          <p>
            {uk ? "Дозамовлення, шт" : "Reorder, units"}:{" "}
            {String(
              preview.orderQuantity ?? (uk ? "Недоступно" : "Unavailable"),
            )}
          </p>
          {plan && (
            <p>
              {uk ? "Виконання плану, %" : "Plan attainment, %"}:{" "}
              {String(
                plan.attainmentPct ?? (uk ? "Недоступно" : "Unavailable"),
              )}
            </p>
          )}
          <p>
            {uk ? "Плече / покриття / MOQ" : "Lead / cover / MOQ"}:{" "}
            {String(policy.leadDays)} / {String(policy.coverDays)} /{" "}
            {String(policy.moq)}
          </p>
          {Boolean(preview.reorderBlocked) && (
            <p>
              {uk
                ? "Експорт потребує підтверджених залишків у дорозі та постачальника."
                : "Export requires confirmed in-transit stock and supplier."}
            </p>
          )}
        </div>
      )}
    </form>
  );
}
