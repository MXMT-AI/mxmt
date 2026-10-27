"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Field, control } from "@/components/merchandising/FormControls";
import { apiFetch } from "@/lib/fetch";
import { readApiJson } from "@/lib/api-response";
import { connectorCheckLabels } from "@/lib/connectors/check-copy";
import { isPublicConnection } from "@/lib/connectors/public-connection";
import type { PublicConnection } from "@/lib/connectors/contract";
const button =
  "min-h-11 rounded-lg border border-[var(--border)] px-4 py-2 text-sm text-[var(--text)] hover:bg-[var(--input-hover)] disabled:opacity-50";
export default function KeyCrmConnectionCard({
  initial,
  lang,
  canManage,
}: {
  initial: PublicConnection;
  lang: "uk" | "en";
  canManage: boolean;
}) {
  const uk = lang === "uk",
    copy = (a: string, b: string) => (uk ? a : b);
  const [connection, setConnection] = useState(initial),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [status, setStatus] = useState(""),
    [dirty, setDirty] = useState(false),
    [approved, setApproved] = useState(false),
    [net, setNet] = useState(false),
    [cost, setCost] = useState(false),
    [paid, setPaid] = useState(false),
    [stock, setStock] = useState(false);
  const form = useRef<HTMLFormElement>(null),
    alert = useRef<HTMLParagraphElement>(null);
  const [statuses, setStatuses] = useState<Array<{ id: string; kind: string }>>(
      [],
    ),
    [channels, setChannels] = useState<Array<{ id: string; name: string }>>([]);
  useEffect(() => {
    if (error) alert.current?.focus();
  }, [error]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  const mutate = () => {
    setDirty(true);
    setApproved(false);
  };
  async function perform(action: "save" | "check", body?: unknown) {
    setBusy(true);
    setError("");
    setStatus("");
    try {
      const r = await apiFetch("/api/connectors/keycrm", {
        method: action === "save" ? "PUT" : "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      const payload = await readApiJson(r);
      const d =
        payload && typeof payload === "object" && !Array.isArray(payload)
          ? payload
          : {};
      if (!r.ok) {
        setError(
          d.code === "VALIDATION_ERROR"
            ? copy(
                "Перевірте ID акаунту, ключ і підтвердження правил.",
                "Check account ID, key and mapping confirmations.",
              )
            : d.code === "CONNECTOR_CONFIG_CHANGED"
              ? copy(
                  "Підвищіть версію зміненого мапінгу та перевірте підключення знову.",
                  "Increase the revision of changed mappings and check again.",
                )
              : copy(
                  "Операцію не завершено. Повторіть спробу або перевірте доступи. Код: ",
                  "Operation failed. Retry or verify permissions. Code: ",
                ) + String(typeof d.code === "string" ? d.code : r.status),
        );
        return;
      }
      if (!isPublicConnection(d)) {
        setError(
          copy(
            "Відповідь сервера некоректна. Повторіть спробу.",
            "The server response is invalid. Retry the operation.",
          ),
        );
        return;
      }
      setConnection(d);
      window.dispatchEvent(new Event("connector-connection-changed"));
      setStatus(
        action === "save"
          ? copy(
              "Збережено. Перевірте доступи, потім явно виберіть KeyCRM як джерело звітів.",
              "Saved. Check read scopes, then explicitly select KeyCRM as the reporting source.",
            )
          : copy(
              "Перевірки читання завершені. Перегляньте кожен ресурс нижче.",
              "Read checks completed. Review each resource below.",
            ),
      );
      if (action === "save") {
        const key = form.current?.elements.namedItem("apiKey");
        if (key instanceof HTMLInputElement) key.value = "";
        setDirty(false);
      } else {
        if (!statuses.length)
          setStatuses(
            (d.lastCheck?.statuses.entries ?? [])
              .slice(0, 100)
              .map((s: { id: string }) => ({ id: s.id, kind: "" })),
          );
        if (!channels.length)
          setChannels((d.lastCheck?.channels.entries ?? []).slice(0, 100));
      }
    } catch {
      setError(
        copy(
          "Не вдалося підключитися. Повторіть спробу.",
          "Could not connect. Retry the operation.",
        ),
      );
    } finally {
      setBusy(false);
    }
  }
  function submit(e: FormEvent) {
    e.preventDefault();
    const data = new FormData(e.currentTarget as HTMLFormElement),
      value = (key: string) => String(data.get(key) ?? "");
    if (
      new Set(statuses.map((s) => s.id)).size !== statuses.length ||
      new Set(channels.map((s) => s.id)).size !== channels.length
    ) {
      setError(
        copy(
          "Коди статусів і каналів мають бути унікальними.",
          "Status/channel codes must be unique.",
        ),
      );
      return;
    }
    const historyFrom = value("historyFrom"),
      historyTo = value("historyTo");
    void perform("save", {
      accountId: value("accountId"),
      apiKey: value("apiKey"),
      timezone: value("timezone"),
      mappingRevision: Number(value("mappingRevision")),
      statuses: Object.fromEntries(
        statuses.filter((s) => s.kind).map((s) => [s.id, s.kind]),
      ),
      channels: Object.fromEntries(channels.map((s) => [s.id, s.name])),
      evidence: approved
        ? {
            reference: value("reference"),
            currency: value("currency"),
            netUnitPrice: net,
            purchasedPriceUnit: cost,
            fullPaymentDate: paid,
            physicalStock: stock,
            warehouseIds: value("warehouseIds")
              .split(",")
              .map((v) => v.trim())
              .filter(Boolean),
            history:
              historyFrom || historyTo
                ? {
                    from: historyFrom,
                    to: historyTo,
                    reference: value("historyReference"),
                  }
                : null,
          }
        : null,
    });
  }
  const checkLabels = connectorCheckLabels(lang);
  const labels: Record<string, string> = {
    orders: copy("Замовлення", "Orders"),
    statuses: copy("Статуси", "Statuses"),
    channels: copy("Канали", "Channels"),
    products: copy("Товари", "Products"),
    offers: copy("Варіанти", "Offers"),
    stock: copy("Залишки", "Stock"),
    receipts: copy("Приходи", "Receipts"),
  };
  return (
    <section
      id="keycrm"
      className="mb-10 scroll-mt-6 space-y-4"
      aria-labelledby="keycrm-heading"
    >
      <div>
        <h2 id="keycrm-heading" className="font-semibold text-[var(--text)]">
          KeyCRM
        </h2>
        <p className="mt-1 max-w-3xl text-sm text-[var(--muted)]">
          {copy(
            "Лише читання з фіксованого API KeyCRM. Ключ зберігається зашифрованим і не повертається у відповідях.",
            "Read-only requests to the fixed KeyCRM API. The key is encrypted and never returned in responses.",
          )}
        </p>
      </div>
      <div className="space-y-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 sm:p-5">
        <p className="text-sm text-[var(--muted)]">
          {connection.configured
            ? copy("Підключено: ", "Configured: ") + connection.accountHost
            : copy("Не налаштовано", "Not configured")}
          .{" "}
          {copy(
            "20 запитів/хв на ключ. Приходи й повернення не підтверджені; автоматична синхронізація вимкнена.",
            "20 requests/minute/key. Supplier receipts and refunds remain unverified; automatic sync is disabled.",
          )}
        </p>
        <p className="text-xs text-[var(--muted)]">
          {copy(
            "Успішне читання не доводить, що ключ не має прав запису. Перевірте права виданого ключа в KeyCRM. Власність брендів, комісії й умови постачальників задаються окремо в Settings.",
            "Successful reads do not prove the key has no write permissions. Verify issued-key permissions in KeyCRM. Configure brand ownership, commissions and supplier terms separately in Settings.",
          )}
        </p>
        {canManage && (
          <form
            ref={form}
            onSubmit={submit}
            autoComplete="off"
            className="space-y-4"
            onChange={(e) => {
              if (
                (e.target as unknown as HTMLInputElement).name !==
                "mappingApproved"
              )
                mutate();
            }}
          >
            <fieldset disabled={busy} className="space-y-4">
              <legend className="sr-only">
                {copy("Налаштування KeyCRM", "KeyCRM settings")}
              </legend>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label={copy(
                    "Логічний ID акаунту (не ключ)",
                    "Logical account ID (not the key)",
                  )}
                >
                  <input
                    name="accountId"
                    className={control}
                    defaultValue={connection.accountHost ?? ""}
                    pattern="[a-z0-9][a-z0-9_-]{0,63}"
                    maxLength={64}
                    required
                    spellCheck={false}
                  />
                </Field>
                <Field label={copy("API-ключ", "API key")}>
                  <input
                    name="apiKey"
                    type="password"
                    autoComplete="new-password"
                    className={control}
                    required
                    minLength={8}
                    maxLength={4096}
                    spellCheck={false}
                  />
                </Field>
                <Field
                  label={copy("Часовий пояс звітів", "Reporting timezone")}
                >
                  <input
                    name="timezone"
                    className={control}
                    defaultValue="Europe/Kyiv"
                    required
                    maxLength={100}
                  />
                </Field>
                <Field label={copy("Версія мапінгу", "Mapping revision")}>
                  <input
                    name="mappingRevision"
                    type="number"
                    min={1}
                    max={1000000}
                    defaultValue={1}
                    className={control}
                    required
                  />
                </Field>
              </div>
              <p className="text-xs text-[var(--muted)]">
                {copy(
                  "Використовуйте стабільний ID і часовий пояс для цього акаунту. Для зміни мапінгу підвищуйте версію; після оновлення повторно введіть ключ. Перше збереження може бути без підтвердженої фінансової моделі.",
                  "Keep account ID and timezone stable. Increase the revision when changing mappings and re-enter the key on updates. The first save can omit verified financial mappings.",
                )}
              </p>
              <fieldset className="space-y-3">
                <legend className="text-sm text-[var(--text)]">
                  {copy("Значення статусів", "Status meanings")}
                </legend>
                {statuses.map((s, i) => (
                  <div className="grid grid-cols-2 gap-3" key={i}>
                    <Field label={copy("Код статусу", "Status code")}>
                      <input
                        className={control}
                        value={s.id}
                        onChange={(e) =>
                          setStatuses((rows) =>
                            rows.map((x, j) =>
                              i === j ? { ...x, id: e.target.value } : x,
                            ),
                          )
                        }
                        required
                        pattern="[0-9]+"
                      />
                    </Field>
                    <Field label={copy("Значення", "Meaning")}>
                      <select
                        className={control}
                        value={s.kind}
                        onChange={(e) =>
                          setStatuses((rows) =>
                            rows.map((x, j) =>
                              i === j ? { ...x, kind: e.target.value } : x,
                            ),
                          )
                        }
                      >
                        <option value="">
                          {copy("Не підтверджено", "Unverified")}
                        </option>
                        <option>SALE</option>
                        <option>PREORDER</option>
                        <option>REFUSAL</option>
                      </select>
                    </Field>
                  </div>
                ))}
                <button
                  className={button}
                  type="button"
                  onClick={() => {
                    mutate();
                    setStatuses((s) => [...s, { id: "", kind: "" }]);
                  }}
                >
                  {copy("Додати статус", "Add status")}
                </button>
              </fieldset>
              <fieldset className="space-y-3">
                <legend className="text-sm text-[var(--text)]">
                  {copy("Канали", "Channels")}
                </legend>
                {channels.map((s, i) => (
                  <div className="grid grid-cols-2 gap-3" key={i}>
                    <Field label={copy("Код каналу", "Channel code")}>
                      <input
                        className={control}
                        required
                        value={s.id}
                        onChange={(e) =>
                          setChannels((rows) =>
                            rows.map((x, j) =>
                              i === j ? { ...x, id: e.target.value } : x,
                            ),
                          )
                        }
                      />
                    </Field>
                    <Field label={copy("Назва", "Name")}>
                      <input
                        className={control}
                        required
                        maxLength={200}
                        value={s.name}
                        onChange={(e) =>
                          setChannels((rows) =>
                            rows.map((x, j) =>
                              i === j ? { ...x, name: e.target.value } : x,
                            ),
                          )
                        }
                      />
                    </Field>
                  </div>
                ))}
                <button
                  className={button}
                  type="button"
                  onClick={() => {
                    mutate();
                    setChannels((s) => [...s, { id: "", name: "" }]);
                  }}
                >
                  {copy("Додати канал", "Add channel")}
                </button>
              </fieldset>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={copy("Підтверджена валюта", "Verified currency")}>
                  <input
                    name="currency"
                    className={control}
                    placeholder="UAH"
                    pattern="[A-Z]{3}"
                    maxLength={3}
                    required={approved}
                  />
                </Field>
                <Field
                  label={copy(
                    "Посилання на погоджений мапінг",
                    "Approved mapping reference",
                  )}
                >
                  <input
                    name="reference"
                    className={control}
                    maxLength={200}
                    required={approved}
                  />
                </Field>
              </div>
              {[
                [
                  net,
                  setNet,
                  copy(
                    "price_sold — чиста ціна за одиницю; загальні знижки вже враховані.",
                    "price_sold is the net unit price, including all applicable discounts.",
                  ),
                ],
                [
                  cost,
                  setCost,
                  copy(
                    "purchased_price — підтверджена собівартість за одиницю.",
                    "purchased_price is verified unit cost.",
                  ),
                ],
                [
                  paid,
                  setPaid,
                  copy(
                    "Дата повної оплати — останній payment_date проведених платежів, сума яких покриває grand_total. Часткова оплата не означає продаж.",
                    "Full payment date is the latest payment_date of paid payments covering grand_total. Partial payment does not establish a sale.",
                  ),
                ],
                [
                  stock,
                  setStock,
                  copy(
                    "quantity — фізичний залишок, включно з резервом. Резерв не віднімаємо.",
                    "quantity is physical stock including reserved units. Reserved stock is not subtracted.",
                  ),
                ],
              ].map(([checked, setter, label], i) => (
                <label
                  key={i}
                  className="flex items-start gap-2 text-sm text-[var(--muted)]"
                >
                  <input
                    type="checkbox"
                    checked={checked as boolean}
                    onChange={(e) =>
                      (setter as (v: boolean) => void)(e.target.checked)
                    }
                  />
                  {label as string}
                </label>
              ))}
              <Field
                label={copy(
                  "ID включених складів через кому; порожньо — агрегат усіх складів",
                  "Included warehouse IDs, comma-separated; empty means all-warehouse aggregate",
                )}
              >
                <input
                  name="warehouseIds"
                  className={control}
                  maxLength={1000}
                  spellCheck={false}
                />
              </Field>
              <details className="space-y-3 text-sm text-[var(--muted)]">
                <summary className="cursor-pointer">
                  {copy(
                    "Підтверджений доступний період історії (необов’язково)",
                    "Verified accessible history interval (optional)",
                  )}
                </summary>
                <p>
                  {copy(
                    "Порожня відповідь не доводить повноту історії. Вкажіть лише звірений період і посилання на погоджені дані.",
                    "An empty response does not prove complete history. Enter only a reconciled interval and its approved evidence reference.",
                  )}
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label={copy("Від (ISO UTC)", "From (ISO UTC)")}>
                    <input
                      className={control}
                      name="historyFrom"
                      placeholder="2025-01-01T00:00:00.000Z"
                    />
                  </Field>
                  <Field label={copy("До (ISO UTC)", "To (ISO UTC)")}>
                    <input
                      className={control}
                      name="historyTo"
                      placeholder="2026-10-25T23:59:59.999Z"
                    />
                  </Field>
                </div>
                <Field
                  label={copy("Еталон історії", "History evidence reference")}
                >
                  <input
                    className={control}
                    name="historyReference"
                    maxLength={200}
                  />
                </Field>
              </details>
              <label className="flex items-start gap-2 text-sm text-[var(--text)]">
                <input
                  type="checkbox"
                  name="mappingApproved"
                  checked={approved}
                  onChange={(e) => setApproved(e.target.checked)}
                />
                {copy(
                  "Погоджую зазначені правила за вказаним еталоном. Непідтверджені значення залишаються невідомими.",
                  "I approve the selected rules against the referenced evidence. Unverified values remain unknown.",
                )}
              </label>
              <div className="flex flex-wrap gap-3">
                <button className={button} disabled={busy}>
                  {busy
                    ? copy("Обробка…", "Processing…")
                    : copy("Зберегти KeyCRM", "Save KeyCRM")}
                </button>
                <button
                  className={button}
                  type="button"
                  disabled={busy || dirty || !connection.configured}
                  onClick={() => void perform("check")}
                >
                  {copy("Перевірити доступи", "Check read scopes")}
                </button>
              </div>
            </fieldset>
          </form>
        )}
        {error && (
          <p
            ref={alert}
            tabIndex={-1}
            role="alert"
            className="text-sm text-[var(--text)]"
          >
            {error}
          </p>
        )}
        {status && (
          <p role="status" className="text-sm text-[var(--muted)]">
            {status}
          </p>
        )}
        {connection.lastCheck && (
          <div
            aria-live="polite"
            className="space-y-2 text-sm text-[var(--muted)]"
          >
            <ul>
              {connection.lastCheck.checks.map((c) => (
                <li key={c.resource}>
                  {labels[c.resource] ?? c.resource}:{" "}
                  {checkLabels[c.code] ?? c.code}
                </li>
              ))}
            </ul>
            {(["statuses", "channels"] as const).map((k) => (
              <details key={k}>
                <summary className="cursor-pointer">{labels[k]}</summary>
                {!connection.lastCheck![k].complete && (
                  <p className="mt-1 text-xs">
                    {copy(
                      "Показано частину довідника. Повне читання виконується під час синхронізації.",
                      "Only part of the dictionary is shown. Full reads run during synchronization.",
                    )}
                  </p>
                )}
                <ul>
                  {connection.lastCheck![k].entries.slice(0, 100).map((d) => (
                    <li key={d.id}>
                      {d.id}: {d.name}
                    </li>
                  ))}
                </ul>
              </details>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
