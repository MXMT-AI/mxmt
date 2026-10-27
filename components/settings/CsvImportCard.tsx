"use client";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { useRouter } from "next/navigation";
import { Field, control } from "@/components/merchandising/FormControls";
import {
  CSV_FIELDS,
  CSV_REQUIRED,
  type CsvFileInput,
  type CsvOptions,
  type CsvResource,
} from "@/lib/connectors/csv/schema";
import { CSV_LIMITS, CsvError, parseCsv } from "@/lib/connectors/csv/parser";
interface Preview {
  id: string;
  sourceId: string;
  contentHash: string;
  state: string;
  expiresAt: string;
  preview: {
    counts: Record<string, number>;
    errors: Array<{
      resource: string;
      row: number;
      code: string;
      field?: string;
    }>;
    warnings: string[];
  };
  job?: { state: string; errorCode: string | null } | null;
  options?: CsvOptions;
  mappings?: Array<Pick<CsvFileInput, "resource" | "delimiter" | "columns">>;
}
interface FileDraft {
  file: CsvFileInput;
  headers: string[];
  name: string;
}
const initialOptions: CsvOptions = {
  schemaVersion: 1,
  mappingRevision: 1,
  timezone: "Europe/Kyiv",
  catalog: "partial",
  stock: "partial",
  history: null,
  receiptHistory: null,
  discountUnit: "amount",
  policy: {
    statuses: { "5": "SALE", "7": "RETURN" },
    channels: { "1": "Shop" },
    amounts: {
      price: "gross_unit",
      absoluteDiscount: "line",
      currency: "UAH",
      cost: "unit",
    },
  },
  approved: false,
};
const resources = Object.keys(CSV_FIELDS) as CsvResource[];
const names = {
  uk: {
    orders: "Рядки замовлень",
    products: "Товари",
    stock: "Датовані залишки",
    receipts: "Рядки приходів",
    statuses: "Назви статусів",
    channels: "Назви каналів",
  },
  en: {
    orders: "Order lines",
    products: "Products",
    stock: "Dated stock",
    receipts: "Receipt lines",
    statuses: "Status names",
    channels: "Channel names",
  },
};
const button =
  "touch-manipulation hover:border-[var(--muted)] min-h-11 rounded-lg border border-[var(--border)] px-4 py-2 text-sm text-[var(--text)] disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2";
function base64(bytes: Uint8Array) {
  let s = "";
  for (let i = 0; i < bytes.length; i += 8192)
    s += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(s);
}
const rowErrorCopy: Record<string, [string, string]> = {
  DUPLICATE_ID: [
    "Повторений ідентифікатор. Залиште один рядок для цієї позиції.",
    "Duplicate identity. Keep one row for this line.",
  ],
  INVALID_DECIMAL: [
    "Використайте число з крапкою та до 4 десяткових знаків.",
    "Use a dot decimal with up to 4 fractional digits.",
  ],
  INVALID_DATE: [
    "Використайте YYYY-MM-DD або ISO UTC із Z.",
    "Use YYYY-MM-DD or an ISO UTC timestamp with Z.",
  ],
  REQUIRED_COLUMN: [
    "Зіставте обов’язкову колонку.",
    "Map the required column.",
  ],
  INVALID_HEADERS: [
    "Заголовки мають бути унікальними й непорожніми.",
    "Headers must be unique and non-empty.",
  ],
  INCONSISTENT_DOCUMENT: [
    "Усі рядки документа повинні мати однакові дати та статус.",
    "All document lines must share dates and status.",
  ],
  INVALID_ID: [
    "Використайте стабільний ID до 200 символів, без пробілів на краях.",
    "Use a stable ID up to 200 characters without surrounding whitespace.",
  ],
};
const errorCopy: Record<string, [string, string]> = {
  CSV_SELECT_SOURCE_FIRST: [
    "Спочатку виберіть CSV як джерело звітів вище.",
    "First select CSV as the reporting source above.",
  ],
  CSV_SETTINGS_CHANGED: [
    "Налаштування змінились. Створіть нову перевірку з новою версією мапінгу.",
    "Settings changed. Preview again with a new mapping revision.",
  ],
  CSV_EXPIRED: [
    "Термін перевірки минув. Завантажте пакет знову.",
    "The preview expired. Upload the packet again.",
  ],
  CSV_PREVIEW_LIMIT: [
    "Скасуйте зайві перевірки перед новим завантаженням.",
    "Cancel unused previews before uploading another packet.",
  ],
  CSV_TIMEZONE_IMMUTABLE: [
    "Використайте часовий пояс існуючого CSV-джерела.",
    "Use the existing CSV source timezone.",
  ],
};
export default function CsvImportCard({
  lang,
  canManage,
}: {
  lang: "uk" | "en";
  canManage: boolean;
}) {
  const uk = lang === "uk",
    copy = (a: string, b: string) => (uk ? a : b),
    router = useRouter();
  const [options, setOptions] = useState<CsvOptions>(initialOptions),
    [delimiters, setDelimiters] = useState<
      Partial<Record<CsvResource, CsvFileInput["delimiter"]>>
    >({}),
    [files, setFiles] = useState<Partial<Record<CsvResource, FileDraft>>>({}),
    [preview, setPreview] = useState<Preview | null>(null),
    [source, setSource] = useState<{
      sourceId: string;
      timezone: string;
    } | null>(null),
    [uploads, setUploads] = useState<Preview[]>([]),
    [suppliers, setSuppliers] = useState<Array<{ id: string; name: string }>>(
      [],
    ),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const [statusRows, setStatusRows] = useState([
      { code: "5", kind: "SALE" },
      { code: "7", kind: "RETURN" },
    ]),
    [channelRows, setChannelRows] = useState([{ code: "1", name: "Shop" }]),
    [receiptStatus, setReceiptStatus] = useState(""),
    [supplierCode, setSupplierCode] = useState(""),
    [supplierId, setSupplierId] = useState(""),
    [costVerified, setCostVerified] = useState(false);
  const [orderHistory, setOrderHistory] = useState(false),
    [receiptHistory, setReceiptHistory] = useState(false),
    [historyFrom, setHistoryFrom] = useState(""),
    [historyTo, setHistoryTo] = useState("");
  const messageRef = useRef<HTMLParagraphElement>(null),
    previewRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (message) messageRef.current?.focus();
  }, [message]);
  useEffect(() => {
    if (preview) previewRef.current?.focus();
  }, [preview?.id]);
  const mounted = useRef(true),
    polling = useRef(false);
  const request = useCallback(async (url: string, init?: RequestInit) => {
    const r = await fetch(url, { ...init, cache: "no-store" });
    const data = await r.json();
    if (!r.ok) throw new Error(data.code ?? "CSV_OPERATION_FAILED");
    return data;
  }, []);
  const load = useCallback(async () => {
    const d = await request("/api/connectors/csv/uploads");
    if (mounted.current) {
      setSource(d.source);
      setUploads(d.uploads);
      setSuppliers(d.suppliers);
      if (d.source) setOptions((o) => ({ ...o, timezone: d.source.timezone }));
    }
  }, [request]);
  useEffect(() => {
    mounted.current = true;
    if (canManage)
      void load().catch(() =>
        setMessage(
          uk
            ? "Не вдалося завантажити CSV-імпорти."
            : "Could not load CSV imports.",
        ),
      );
    return () => {
      mounted.current = false;
    };
  }, [canManage, load, uk]);
  useEffect(() => {
    if (!Object.keys(files).length || preview) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [files, preview]);
  useEffect(() => {
    if (
      !preview ||
      preview.state !== "QUEUED" ||
      ["FAILED", "PAUSED"].includes(preview.job?.state ?? "")
    )
      return;
    const controller = new AbortController();
    const tick = async () => {
      if (polling.current) return;
      polling.current = true;
      try {
        const next = await request(
          `/api/connectors/csv/uploads/${preview.id}`,
          { signal: controller.signal },
        );
        if (!controller.signal.aborted) {
          setPreview(next);
          if (next.state === "ACTIVE") {
            router.refresh();
            window.dispatchEvent(new Event("connector-inputs-changed"));
            void load();
          }
        }
      } catch {
        if (!controller.signal.aborted)
          setMessage(
            uk
              ? "Не вдалося оновити стан імпорту."
              : "Could not refresh import status.",
          );
      } finally {
        polling.current = false;
      }
    };
    const timer = setInterval(() => void tick(), 3000);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [
    preview?.id,
    preview?.state,
    preview?.job?.state,
    request,
    router,
    load,
    uk,
  ]);
  const changed = () => {
    setPreview(null);
    setMessage("");
    setOptions((o) => ({ ...o, approved: false }));
  };
  const failure = (e: unknown) => {
    const code = e instanceof Error ? e.message : "CSV_OPERATION_FAILED";
    setMessage(
      errorCopy[code]?.[uk ? 0 : 1] ??
        copy(
          "Операцію не завершено. Перевірте файли та повторіть спробу. Код: ",
          "Operation failed. Check the files and retry. Code: ",
        ) + code,
    );
  };
  const choose = async (resource: CsvResource, file: File | undefined) => {
    changed();
    if (!file) {
      setFiles((f) => {
        const next = { ...f };
        delete next[resource];
        return next;
      });
      return;
    }
    setBusy(true);
    try {
      if (file.size > CSV_LIMITS.fileBytes) throw new Error("FILE_TOO_LARGE");
      const bytes = new Uint8Array(await file.arrayBuffer()),
        delimiter = delimiters[resource] ?? ",";
      const parsed = parseCsv(bytes, delimiter);
      const columns = Object.fromEntries(
        CSV_FIELDS[resource]
          .filter((f) => parsed.headers.includes(f))
          .map((f) => [f, f]),
      );
      setFiles((f) => ({
        ...f,
        [resource]: {
          file: { resource, bytes: base64(bytes), delimiter, columns },
          headers: parsed.headers,
          name: file.name,
        },
      }));
    } catch (e) {
      setFiles((f) => {
        const next = { ...f };
        delete next[resource];
        return next;
      });
      if (e instanceof CsvError)
        setMessage(
          `${names[lang][resource]}: ${copy("рядок", "row")} ${e.row || 1} — ${e.code}`,
        );
      else failure(e);
    } finally {
      setBusy(false);
    }
  };
  const delimiter = (
    resource: CsvResource,
    value: CsvFileInput["delimiter"],
  ) => {
    changed();
    setDelimiters((d) => ({ ...d, [resource]: value }));
    const old = files[resource];
    if (!old) return;
    try {
      const bytes = Uint8Array.from(atob(old.file.bytes), (c) =>
        c.charCodeAt(0),
      );
      const parsed = parseCsv(bytes, value);
      setFiles((f) => ({
        ...f,
        [resource]: {
          ...old,
          headers: parsed.headers,
          file: {
            ...old.file,
            delimiter: value,
            columns: Object.fromEntries(
              CSV_FIELDS[resource]
                .filter((k) => parsed.headers.includes(k))
                .map((k) => [k, k]),
            ),
          },
        },
      }));
    } catch (e) {
      failure(e);
      setFiles((f) => {
        const next = { ...f };
        delete next[resource];
        return next;
      });
    }
  };
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      if (
        new Set(statusRows.map((r) => r.code)).size !== statusRows.length ||
        new Set(channelRows.map((r) => r.code)).size !== channelRows.length
      )
        throw new Error("DUPLICATE_MAPPING");
      const opts: CsvOptions = {
        ...options,
        history: orderHistory
          ? { from: historyFrom, to: historyTo, complete: true }
          : null,
        receiptBaseline: receiptHistory && options.receiptBaseline === true,
        receiptHistory: receiptHistory
          ? { from: historyFrom, to: historyTo, complete: true }
          : null,
        policy: {
          ...options.policy,
          statuses: Object.fromEntries(
            statusRows.map((r) => [r.code, r.kind]),
          ) as CsvOptions["policy"]["statuses"],
          channels: Object.fromEntries(
            channelRows.map((r) => [r.code, r.name]),
          ),
          ...(files.receipts
            ? {
                receipts: {
                  postedStatuses: [receiptStatus],
                  suppliers: { [supplierCode]: supplierId },
                  productIdField: "id" as const,
                  currency: options.policy.amounts.currency,
                  unitCostVerified: costVerified,
                },
              }
            : {}),
        },
      };
      const result = await request("/api/connectors/csv/uploads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceId: source?.sourceId ?? null,
          options: opts,
          files: resources.flatMap((r) => (files[r] ? [files[r]!.file] : [])),
        }),
      });
      setPreview(result);
      await load();
      window.dispatchEvent(new Event("connector-connection-changed"));
    } catch (e) {
      failure(e);
    } finally {
      setBusy(false);
    }
  }
  async function action(kind: "activate" | "cancel" | "retry" | "process") {
    if (!preview) return;
    setBusy(true);
    setMessage("");
    try {
      await request(`/api/connectors/csv/uploads/${preview.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: kind, hash: preview.contentHash }),
      });
      if (kind === "activate" || kind === "retry")
        await request(`/api/connectors/csv/uploads/${preview.id}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "process",
            hash: preview.contentHash,
          }),
        });
      const next = await request(`/api/connectors/csv/uploads/${preview.id}`);
      setPreview(next);
      await load();
      if (next.state === "ACTIVE") {
        router.refresh();
        window.dispatchEvent(new Event("connector-inputs-changed"));
      }
    } catch (e) {
      failure(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="mb-10 space-y-4" aria-labelledby="csv-import-title">
      <div>
        <h2 id="csv-import-title" className="font-semibold text-[var(--text)]">
          {copy("Імпорт CSV", "CSV import")}
        </h2>
        <p className="mt-1 max-w-3xl text-sm text-[var(--muted)]">
          {copy(
            "Завантажте окремі файли, зіставте колонки та перевірте пакет перед активацією. Дані не зміняться до активації.",
            "Upload separate files, map columns and preview the packet before activation. Data changes only on activation.",
          )}
        </p>
      </div>
      {!canManage ? (
        <p className="text-sm text-[var(--muted)]">
          {copy(
            "CSV-файли завантажує й активує адміністратор.",
            "An administrator uploads and activates CSV files.",
          )}
        </p>
      ) : (
        <>
          <form
            autoComplete="off"
            spellCheck={false}
            onSubmit={submit}
            className="space-y-5 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 sm:p-5"
          >
            <fieldset disabled={busy} className="space-y-5">
              <legend className="sr-only">
                {copy("Файли та правила імпорту", "Import files and rules")}
              </legend>
              <div className="grid gap-4 sm:grid-cols-3">
                <Field label={copy("Часовий пояс дат", "Date timezone")}>
                  <input
                    className={control}
                    value={options.timezone}
                    readOnly={Boolean(source)}
                    onChange={(e) => {
                      changed();
                      setOptions((o) => ({ ...o, timezone: e.target.value }));
                    }}
                    required
                    maxLength={100}
                  />
                </Field>
                <Field label={copy("Валюта сум", "Amount currency")}>
                  <input
                    className={control}
                    value={options.policy.amounts.currency}
                    onChange={(e) => {
                      changed();
                      setOptions((o) => ({
                        ...o,
                        policy: {
                          ...o.policy,
                          amounts: {
                            ...o.policy.amounts,
                            currency: e.target.value.toUpperCase(),
                          },
                        },
                      }));
                    }}
                    required
                    pattern="[A-Z]{3}"
                    maxLength={3}
                  />
                </Field>
                <Field label={copy("Версія мапінгу", "Mapping revision")}>
                  <input
                    type="number"
                    min={1}
                    max={1000000}
                    className={control}
                    value={options.mappingRevision}
                    onChange={(e) => {
                      changed();
                      setOptions((o) => ({
                        ...o,
                        mappingRevision: Number(e.target.value),
                      }));
                    }}
                    required
                  />
                </Field>
              </div>
              <p className="text-xs text-[var(--muted)]">
                {copy(
                  "UTF-8, до 256 КіБ на файл, 1 МіБ і 500 рядків на пакет. Числа: крапка, до 4 знаків після неї. Дати: YYYY-MM-DD; час зміни та спостереження: ISO UTC із Z. Порожня клітинка означає «невідомо», а не нуль.",
                  "UTF-8, up to 256 KiB per file, 1 MiB and 500 rows per packet. Decimals use a dot and up to 4 fractional digits. Dates: YYYY-MM-DD; update/observation timestamps: ISO UTC with Z. Empty means unknown, not zero.",
                )}
              </p>
              {resources.map((resource) => (
                <details
                  id={`csv-file-${resource}`}
                  key={resource}
                  className="rounded-lg border border-[var(--border)] p-3"
                >
                  <summary className="cursor-pointer break-words text-sm text-[var(--text)]">
                    {names[lang][resource]}
                    {files[resource] ? ` — ${files[resource]!.name}` : ""}
                  </summary>
                  <div className="mt-4 space-y-4">
                    <Field label={copy("Роздільник", "Delimiter")}>
                      <select
                        className={control}
                        value={delimiters[resource] ?? ","}
                        onChange={(e) =>
                          delimiter(
                            resource,
                            e.target.value as CsvFileInput["delimiter"],
                          )
                        }
                      >
                        <option value=",">{copy("Кома", "Comma")}</option>
                        <option value=";">
                          {copy("Крапка з комою", "Semicolon")}
                        </option>
                        <option value={"\t"}>{copy("Табуляція", "Tab")}</option>
                      </select>
                    </Field>
                    <Field label={copy("CSV-файл", "CSV file")}>
                      <input
                        className={control}
                        type="file"
                        accept=".csv,text/csv"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          e.currentTarget.value = "";
                          void choose(resource, file);
                        }}
                      />
                    </Field>
                    <a
                      className="inline-block text-sm text-[var(--accent)] underline"
                      download={`${resource}-v1.csv`}
                      href={`data:text/csv;charset=utf-8,${encodeURIComponent(CSV_FIELDS[resource].join(",") + "\n")}`}
                    >
                      {copy("Шаблон колонок", "Column template")}
                    </a>
                    {files[resource] && (
                      <>
                        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                          {CSV_FIELDS[resource].map((field) => (
                            <Field
                              key={field}
                              label={`${field}${CSV_REQUIRED[resource].includes(field) ? " *" : ""}`}
                            >
                              <select
                                className={control}
                                required={CSV_REQUIRED[resource].includes(
                                  field,
                                )}
                                value={
                                  files[resource]!.file.columns[field] ?? ""
                                }
                                onChange={(e) => {
                                  changed();
                                  const value = e.target.value;
                                  setFiles((f) => {
                                    const old = f[resource]!,
                                      columns = { ...old.file.columns };
                                    if (value) columns[field] = value;
                                    else delete columns[field];
                                    return {
                                      ...f,
                                      [resource]: {
                                        ...old,
                                        file: { ...old.file, columns },
                                      },
                                    };
                                  });
                                }}
                              >
                                <option value="">
                                  {copy("Не зіставлено", "Not mapped")}
                                </option>
                                {files[resource]!.headers.map((h) => (
                                  <option key={h} value={h}>
                                    {h}
                                  </option>
                                ))}
                              </select>
                            </Field>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                </details>
              ))}
              <div className="grid gap-4 sm:grid-cols-2">
                {(["catalog", "stock"] as const).map((key) => (
                  <Field
                    key={key}
                    label={
                      key === "catalog"
                        ? copy("Повнота каталогу", "Catalog population")
                        : copy(
                            "Повнота кожного залишку",
                            "Population of each stock observation",
                          )
                    }
                  >
                    <select
                      className={control}
                      value={options[key]}
                      onChange={(e) => {
                        changed();
                        setOptions((o) => ({ ...o, [key]: e.target.value }));
                      }}
                    >
                      <option value="partial">
                        {copy("Частина товарів", "Partial population")}
                      </option>
                      <option value="complete">
                        {copy(
                          "Усі товари джерела",
                          "Complete source population",
                        )}
                      </option>
                    </select>
                  </Field>
                ))}
              </div>
              <p className="text-xs text-[var(--muted)]">
                {copy(
                  "Товари й залишки завантажуються разом. Пропущені товари не обнуляються. Власність брендів і умови постачальників налаштовуються окремо в Settings.",
                  "Upload products and stock together. Omitted products are not zeroed. Configure brand ownership and supplier terms separately in Settings.",
                )}
              </p>
              <fieldset className="space-y-3">
                <legend className="text-sm text-[var(--text)]">
                  {copy("Значення статусів", "Status meanings")}
                </legend>
                {statusRows.map((r, i) => (
                  <div key={i} className="grid grid-cols-2 gap-3">
                    <Field label={copy("Код статусу", "Status code")}>
                      <input
                        className={control}
                        value={r.code}
                        onChange={(e) => {
                          changed();
                          setStatusRows((rows) =>
                            rows.map((x, j) =>
                              j === i ? { ...x, code: e.target.value } : x,
                            ),
                          );
                        }}
                        required
                        pattern="(0|[1-9][0-9]{0,8})"
                      />
                    </Field>
                    <Field label={copy("Значення", "Meaning")}>
                      <select
                        className={control}
                        value={r.kind}
                        onChange={(e) => {
                          changed();
                          setStatusRows((rows) =>
                            rows.map((x, j) =>
                              j === i ? { ...x, kind: e.target.value } : x,
                            ),
                          );
                        }}
                      >
                        {[
                          "SALE",
                          "RETURN",
                          "CORRECTION",
                          "PREORDER",
                          "REFUSAL",
                        ].map((k) => (
                          <option key={k}>{k}</option>
                        ))}
                      </select>
                    </Field>
                  </div>
                ))}
                <button
                  type="button"
                  className={button}
                  onClick={() => {
                    changed();
                    setStatusRows((r) => [...r, { code: "", kind: "SALE" }]);
                  }}
                >
                  {copy("Додати статус", "Add status")}
                </button>
              </fieldset>
              <fieldset className="space-y-3">
                <legend className="text-sm text-[var(--text)]">
                  {copy("Канали продажів", "Sales channels")}
                </legend>
                {channelRows.map((r, i) => (
                  <div key={i} className="grid grid-cols-2 gap-3">
                    <Field label={copy("Код каналу", "Channel code")}>
                      <input
                        className={control}
                        required
                        value={r.code}
                        onChange={(e) => {
                          changed();
                          setChannelRows((rows) =>
                            rows.map((x, j) =>
                              j === i ? { ...x, code: e.target.value } : x,
                            ),
                          );
                        }}
                      />
                    </Field>
                    <Field label={copy("Назва каналу", "Channel name")}>
                      <input
                        className={control}
                        required
                        maxLength={200}
                        value={r.name}
                        onChange={(e) => {
                          changed();
                          setChannelRows((rows) =>
                            rows.map((x, j) =>
                              j === i ? { ...x, name: e.target.value } : x,
                            ),
                          );
                        }}
                      />
                    </Field>
                  </div>
                ))}
                <button
                  className={button}
                  type="button"
                  onClick={() => {
                    changed();
                    setChannelRows((r) => [...r, { code: "", name: "" }]);
                  }}
                >
                  {copy("Додати канал", "Add channel")}
                </button>
              </fieldset>
              <div className="grid gap-4 sm:grid-cols-3">
                <Field label={copy("Ціна в рядку", "Line price")}>
                  <select
                    className={control}
                    value={options.policy.amounts.price}
                    onChange={(e) => {
                      changed();
                      setOptions((o) => ({
                        ...o,
                        policy: {
                          ...o.policy,
                          amounts: {
                            ...o.policy.amounts,
                            price: e.target.value as "gross_unit" | "net_unit",
                          },
                        },
                      }));
                    }}
                  >
                    <option value="gross_unit">
                      {copy(
                        "За одиницю, до знижки",
                        "Unit price before discount",
                      )}
                    </option>
                    <option value="net_unit">
                      {copy(
                        "За одиницю, після знижки",
                        "Unit price after discount",
                      )}
                    </option>
                  </select>
                </Field>
                <Field label={copy("Тип знижки", "Discount unit")}>
                  <select
                    className={control}
                    value={options.discountUnit}
                    onChange={(e) => {
                      changed();
                      setOptions((o) => ({
                        ...o,
                        discountUnit: e.target.value as "amount" | "percentage",
                      }));
                    }}
                  >
                    <option value="amount">{copy("Сума", "Amount")}</option>
                    <option value="percentage">
                      {copy("Відсоток", "Percentage")}
                    </option>
                  </select>
                </Field>
                <Field label={copy("Абсолютна знижка", "Absolute discount")}>
                  <select
                    className={control}
                    value={options.policy.amounts.absoluteDiscount}
                    onChange={(e) => {
                      changed();
                      setOptions((o) => ({
                        ...o,
                        policy: {
                          ...o.policy,
                          amounts: {
                            ...o.policy.amounts,
                            absoluteDiscount: e.target.value as "line" | "unit",
                          },
                        },
                      }));
                    }}
                  >
                    <option value="line">
                      {copy("На весь рядок", "Per line")}
                    </option>
                    <option value="unit">
                      {copy("На одиницю", "Per unit")}
                    </option>
                  </select>
                </Field>
              </div>
              {files.receipts && (
                <fieldset className="grid gap-4 sm:grid-cols-3">
                  <legend className="mb-3 text-sm text-[var(--text)]">
                    {copy("Підтверджені приходи", "Verified receipts")}
                  </legend>
                  <Field
                    label={copy("Проведений статус", "Posted status code")}
                  >
                    <input
                      className={control}
                      required
                      value={receiptStatus}
                      onChange={(e) => {
                        changed();
                        setReceiptStatus(e.target.value);
                      }}
                    />
                  </Field>
                  <Field
                    label={copy(
                      "Код постачальника у файлі",
                      "Supplier code in file",
                    )}
                  >
                    <input
                      className={control}
                      required
                      value={supplierCode}
                      onChange={(e) => {
                        changed();
                        setSupplierCode(e.target.value);
                      }}
                    />
                  </Field>
                  <Field label={copy("Постачальник", "Supplier")}>
                    <select
                      className={control}
                      required
                      value={supplierId}
                      onChange={(e) => {
                        changed();
                        setSupplierId(e.target.value);
                      }}
                    >
                      <option value="">
                        {copy("Оберіть постачальника", "Choose supplier")}
                      </option>
                      {suppliers.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <label className="flex items-start gap-2 text-sm text-[var(--muted)] sm:col-span-3">
                    <input
                      type="checkbox"
                      checked={costVerified}
                      onChange={(e) => {
                        changed();
                        setCostVerified(e.target.checked);
                      }}
                    />
                    {copy(
                      "Закупівельна ціна — підтверджена ціна за одиницю.",
                      "Purchase cost is a verified unit cost.",
                    )}
                  </label>
                </fieldset>
              )}
              <fieldset className="space-y-3">
                <legend className="text-sm text-[var(--text)]">
                  {copy(
                    "Підтверджене покриття історії",
                    "Verified history coverage",
                  )}
                </legend>
                <label className="flex gap-2 text-sm text-[var(--muted)]">
                  <input
                    type="checkbox"
                    checked={orderHistory}
                    onChange={(e) => {
                      changed();
                      setOrderHistory(e.target.checked);
                    }}
                  />
                  {copy(
                    "Файл містить усю історію замовлень за період",
                    "The file contains complete order history for the interval",
                  )}
                </label>
                <label className="flex gap-2 text-sm text-[var(--muted)]">
                  <input
                    type="checkbox"
                    checked={receiptHistory}
                    onChange={(e) => {
                      changed();
                      setReceiptHistory(e.target.checked);
                    }}
                  />
                  {copy(
                    "Файл містить усі приходи за період",
                    "The file contains complete receipt history for the interval",
                  )}
                </label>
                {receiptHistory && (
                  <label className="flex gap-2 text-sm text-[var(--muted)]">
                    <input
                      type="checkbox"
                      checked={options.receiptBaseline ?? false}
                      onChange={(e) => {
                        changed();
                        setOptions((o) => ({
                          ...o,
                          receiptBaseline: e.target.checked,
                        }));
                      }}
                    />
                    {copy(
                      "Це повна історія приходів від початку діяльності, без попередніх приходів за межами періоду.",
                      "This includes every receipt since the business began, with no earlier receipts outside the interval.",
                    )}
                  </label>
                )}
                {(orderHistory || receiptHistory) && (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label={copy("Початок (ISO UTC)", "Start (ISO UTC)")}>
                      <input
                        className={control}
                        required
                        placeholder="2025-01-01T00:00:00.000Z"
                        value={historyFrom}
                        onChange={(e) => {
                          changed();
                          setHistoryFrom(e.target.value);
                        }}
                      />
                    </Field>
                    <Field label={copy("Кінець (ISO UTC)", "End (ISO UTC)")}>
                      <input
                        className={control}
                        required
                        placeholder="2026-10-25T23:59:59.999Z"
                        value={historyTo}
                        onChange={(e) => {
                          changed();
                          setHistoryTo(e.target.value);
                        }}
                      />
                    </Field>
                  </div>
                )}
              </fieldset>
              <label className="flex items-start gap-2 text-sm text-[var(--text)]">
                <input
                  type="checkbox"
                  required
                  checked={options.approved}
                  onChange={(e) => {
                    setPreview(null);
                    setOptions((o) => ({ ...o, approved: e.target.checked }));
                  }}
                />
                {copy(
                  "Підтверджую колонки, валюту, дати, статуси, знижки, ціни за одиницю та повноту файлів. Власність брендів не визначається з CSV.",
                  "I confirm the columns, currency, dates, statuses, discounts, unit prices and file completeness. Brand ownership is not inferred from CSV.",
                )}
              </label>
              <button
                className={button}
                disabled={
                  busy || !Object.keys(files).length || !options.approved
                }
              >
                {busy
                  ? copy("Обробка…", "Processing…")
                  : copy("Перевірити пакет", "Preview packet")}
              </button>
            </fieldset>
          </form>
          {message && (
            <p
              ref={messageRef}
              tabIndex={-1}
              role="alert"
              className="break-words text-sm text-[var(--text)]"
            >
              {message}
            </p>
          )}
          {preview && (
            <div
              className="space-y-4 rounded-xl border border-[var(--border)] p-4"
              ref={previewRef}
              tabIndex={-1}
              aria-live="polite"
            >
              <h3 className="font-medium text-[var(--text)]">
                {copy("Результат перевірки", "Preview result")} —{" "}
                {preview.state}
              </h3>
              <p className="text-sm text-[var(--muted)]">
                {Object.entries(preview.preview.counts)
                  .map(([r, n]) => `${names[lang][r as CsvResource]}: ${n}`)
                  .join("; ")}
              </p>
              <p className="text-xs text-[var(--muted)]">
                {copy(
                  "Термін зберігання неактивованого пакета:",
                  "Unactivated packet retention:",
                )}{" "}
                {new Date(preview.expiresAt).toLocaleDateString(
                  uk ? "uk-UA" : "en-GB",
                )}
                .{" "}
                {copy(
                  "Активовані файли зберігаються для аудиту.",
                  "Activated files are retained for audit.",
                )}
              </p>
              <p className="break-all text-xs text-[var(--muted)]">
                SHA-256: {preview.contentHash}
              </p>
              {preview.options && (
                <details className="text-sm text-[var(--muted)]">
                  <summary className="cursor-pointer">
                    {copy(
                      "Зафіксовані правила та колонки",
                      "Frozen rules and column mappings",
                    )}
                  </summary>
                  <div className="mt-3 space-y-3 break-words">
                    <p>
                      {preview.options.timezone} ·{" "}
                      {preview.options.policy.amounts.currency} ·{" "}
                      {copy("версія", "revision")}{" "}
                      {preview.options.mappingRevision}
                    </p>
                    <p>
                      {copy("Каталог / залишки:", "Catalog / stock:")}{" "}
                      {preview.options.catalog} / {preview.options.stock}.{" "}
                      {preview.options.policy.amounts.price} ·{" "}
                      {preview.options.discountUnit} ·{" "}
                      {preview.options.policy.amounts.absoluteDiscount}
                    </p>
                    <p>
                      {copy("Статуси:", "Statuses:")}{" "}
                      {Object.entries(preview.options.policy.statuses)
                        .map(([k, v]) => `${k}: ${v}`)
                        .join("; ")}
                    </p>
                    <p>
                      {copy("Канали:", "Channels:")}{" "}
                      {Object.entries(preview.options.policy.channels)
                        .map(([k, v]) => `${k}: ${v}`)
                        .join("; ")}
                    </p>
                    {preview.options.history && (
                      <p>
                        {copy("Історія замовлень:", "Order history:")}{" "}
                        {preview.options.history.from} –{" "}
                        {preview.options.history.to};{" "}
                        {String(preview.options.history.complete)}
                      </p>
                    )}
                    {preview.options.receiptHistory && (
                      <p>
                        {copy("Історія приходів:", "Receipt history:")}{" "}
                        {preview.options.receiptHistory.from} –{" "}
                        {preview.options.receiptHistory.to};{" "}
                        {String(preview.options.receiptHistory.complete)};
                        baseline:{" "}
                        {String(preview.options.receiptBaseline ?? false)}
                      </p>
                    )}
                    {preview.options.policy.receipts && (
                      <p>
                        {copy(
                          "Проведені статуси / постачальники:",
                          "Posted statuses / suppliers:",
                        )}{" "}
                        {preview.options.policy.receipts.postedStatuses.join(
                          ", ",
                        )}{" "}
                        /{" "}
                        {Object.entries(
                          preview.options.policy.receipts.suppliers,
                        )
                          .map(
                            ([k, v]) =>
                              `${k}: ${suppliers.find((s) => s.id === v)?.name ?? v}`,
                          )
                          .join("; ")}
                      </p>
                    )}
                    {preview.mappings?.map((m) => (
                      <div key={m.resource}>
                        <a
                          className="underline"
                          href={`/api/connectors/csv/uploads/${preview.id}?file=${m.resource}`}
                          download
                        >
                          {names[lang][m.resource]}
                        </a>{" "}
                        (
                        {m.delimiter === "\t"
                          ? copy("табуляція", "tab")
                          : m.delimiter}
                        )
                        <ul className="list-inside list-disc">
                          {Object.entries(m.columns).map(([field, header]) => (
                            <li key={field}>
                              {field}: {header}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                </details>
              )}
              {preview.preview.errors.length > 0 && (
                <ul className="list-inside list-disc space-y-1 text-sm text-[var(--text)]">
                  {preview.preview.errors.map((e, i) => (
                    <li key={i}>
                      <a
                        className="underline"
                        href={`#csv-file-${e.resource}`}
                        onClick={() => {
                          const details = document.getElementById(
                            `csv-file-${e.resource}`,
                          );
                          if (details instanceof HTMLDetailsElement)
                            details.open = true;
                        }}
                      >
                        {names[lang][e.resource as CsvResource]} ·{" "}
                        {copy("рядок", "row")} {e.row || "—"}{" "}
                        {e.field ? `(${e.field})` : ""}:{" "}
                        {rowErrorCopy[e.code]?.[uk ? 0 : 1] ??
                          copy(
                            "Виправте рядок або мапінг. Код: ",
                            "Correct the row or mapping. Code: ",
                          ) + e.code}
                      </a>
                    </li>
                  ))}
                </ul>
              )}
              {preview.preview.warnings.length > 0 && (
                <details className="text-sm text-[var(--muted)]">
                  <summary className="cursor-pointer">
                    {copy(
                      "Обмеження та попередження",
                      "Limitations and warnings",
                    )}
                  </summary>
                  <ul className="mt-2 list-inside list-disc">
                    {preview.preview.warnings.map((w) => (
                      <li key={w}>{w}</li>
                    ))}
                  </ul>
                </details>
              )}
              {preview.job?.errorCode && (
                <p role="alert" className="text-sm text-[var(--text)]">
                  {copy("Імпорт зупинено:", "Import paused:")}{" "}
                  {preview.job.errorCode}
                </p>
              )}
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  className={button}
                  disabled={
                    busy ||
                    preview.state !== "READY" ||
                    preview.preview.errors.length > 0
                  }
                  onClick={() => void action("activate")}
                >
                  {copy(
                    "Активувати перевірений пакет",
                    "Activate validated packet",
                  )}
                </button>
                {preview.state === "QUEUED" && (
                  <button
                    type="button"
                    className={button}
                    disabled={busy}
                    onClick={() =>
                      void action(
                        ["FAILED", "PAUSED", "RETRY"].includes(
                          preview.job?.state ?? "",
                        )
                          ? "retry"
                          : "process",
                      )
                    }
                  >
                    {copy("Продовжити імпорт", "Continue import")}
                  </button>
                )}
                <button
                  type="button"
                  className={button}
                  disabled={
                    busy ||
                    ["ACTIVE", "CANCELLED", "EXPIRED"].includes(preview.state)
                  }
                  onClick={() => void action("cancel")}
                >
                  {copy("Скасувати пакет", "Cancel packet")}
                </button>
              </div>
              <p className="text-xs text-[var(--muted)]">
                {copy(
                  "Для активації виберіть CSV у «Джерелі звітів» вище. Перевірка та активація — окремі дії.",
                  "To activate, choose CSV in Reporting source above. Preview and activation are separate actions.",
                )}
              </p>
            </div>
          )}
          {uploads.length > 0 && (
            <details className="text-sm text-[var(--muted)]">
              <summary className="cursor-pointer">
                {copy("Останні пакети", "Recent packets")}
              </summary>
              <ul className="mt-3 space-y-2">
                {uploads.map((u) => (
                  <li key={u.id}>
                    <button
                      type="button"
                      disabled={busy}
                      className={button}
                      onClick={() => {
                        setBusy(true);
                        void request(`/api/connectors/csv/uploads/${u.id}`)
                          .then(setPreview)
                          .catch(failure)
                          .finally(() => setBusy(false));
                      }}
                    >
                      {u.state} · {u.contentHash.slice(0, 12)}
                    </button>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}
    </section>
  );
}
