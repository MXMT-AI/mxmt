"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Field, control } from "@/components/merchandising/FormControls";
import { apiFetch } from "@/lib/fetch";
import { readApiJson } from "@/lib/api-response";
import { isPublicConnection } from "@/lib/connectors/public-connection";
import type { PublicConnection } from "@/lib/connectors/contract";
import StatusMappingFields, {
  type StatusMappingRow,
} from "./StatusMappingFields";
import ConnectorDiagnostics from "./ConnectorDiagnostics";
const button =
  "min-h-11 rounded-lg border border-[var(--border)] px-4 py-2 text-sm text-[var(--text)] hover:bg-[var(--input-hover)] focus-visible:outline focus-visible:outline-2 disabled:opacity-50";
export default function HoroshopConnectionCard({
  initial,
  lang,
  canManage,
}: {
  initial: PublicConnection;
  lang: "uk" | "en";
  canManage: boolean;
}) {
  const copy = (uk: string, en: string) => (lang === "uk" ? uk : en);
  const [connection, setConnection] = useState(initial),
    [busy, setBusy] = useState(false),
    [dirty, setDirty] = useState(false),
    [error, setError] = useState(""),
    [status, setStatus] = useState("");
  const [statuses, setStatuses] = useState<StatusMappingRow[]>([]);
  const form = useRef<HTMLFormElement>(null),
    alert = useRef<HTMLParagraphElement>(null);
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
  async function perform(action: "save" | "check", body?: unknown) {
    setBusy(true);
    setError("");
    setStatus("");
    try {
      const r = await apiFetch("/api/connectors/horoshop", {
          method: action === "save" ? "PUT" : "POST",
          cache: "no-store",
          headers: { "Content-Type": "application/json" },
          ...(body ? { body: JSON.stringify(body) } : {}),
        }),
        d = await readApiJson(r);
      if (!r.ok) {
        const code = typeof d?.code === "string" ? d.code : String(r.status);
        setError(
          code === "CONNECTOR_CONFIG_CHANGED"
            ? copy(
                "Підвищіть версію змінених правил і перевірте підключення знову.",
                "Increase the revision of changed rules and check again.",
              )
            : copy(
                "Перевірте поля, підтвердження й доступи. Код: ",
                "Check fields, confirmations and permissions. Code: ",
              ) + code,
        );
        return;
      }
      if (!isPublicConnection(d)) {
        setError(
          copy(
            "Некоректна відповідь сервера. Повторіть спробу.",
            "Invalid server response. Retry the operation.",
          ),
        );
        return;
      }
      setConnection(d);
      if (action === "check" && !statuses.length)
        setStatuses(
          (d.lastCheck?.statuses.entries ?? [])
            .slice(0, 100)
            .map((s) => ({ id: s.id, kind: "" })),
        );
      window.dispatchEvent(new Event("connector-connection-changed"));
      setStatus(
        action === "save"
          ? copy(
              "Збережено. Перевірте доступи, потім виберіть Horoshop у джерелах звітів.",
              "Saved. Check read scopes, then select Horoshop as the reporting source.",
            )
          : copy(
              "Перевірки завершено. Перегляньте результат кожного ресурсу.",
              "Checks completed. Review each resource result.",
            ),
      );
      if (action === "save") {
        for (const name of ["login", "password"]) {
          const el = form.current?.elements.namedItem(name);
          if (el instanceof HTMLInputElement) el.value = "";
        }
        setDirty(false);
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
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const d = new FormData(e.currentTarget),
      value = (k: string) => String(d.get(k) ?? "");
    if (new Set(statuses.map((s) => s.id)).size !== statuses.length) {
      setError(
        copy(
          "Коди статусів мають бути унікальними.",
          "Status codes must be unique.",
        ),
      );
      return;
    }
    void perform("save", {
      origin: value("origin"),
      login: value("login"),
      password: value("password"),
      timezone: value("timezone"),
      mappingRevision: Number(value("mappingRevision")),
      statuses: Object.fromEntries(
        statuses.filter((s) => s.kind).map((s) => [s.id, s.kind]),
      ),
      evidence: {
        reference: value("reference"),
        currency: value("currency"),
        requestsPerWindow: Number(value("requestsPerWindow")),
        windowSeconds: Number(value("windowSeconds")),
        stableOrderPagination: d.has("stableOrderPagination"),
        catalogCount:
          value("catalogCount") === "" ? null : Number(value("catalogCount")),
        physicalStock: d.has("physicalStock"),
        warehouses: value("warehouses")
          .split(",")
          .map((v) => v.trim())
          .filter(Boolean),
        netUnitPrice: d.has("netUnitPrice"),
      },
    });
  }
  return (
    <section
      id="horoshop"
      aria-labelledby="horoshop-heading"
      className="mb-10 scroll-mt-6 space-y-4"
    >
      <div>
        <h2 id="horoshop-heading" className="font-semibold text-[var(--text)]">
          Horoshop
        </h2>
        <p className="mt-1 max-w-3xl text-sm text-[var(--muted)]">
          {copy(
            "Лише читання. Кожне оновлення повторно читає всю доступну історію замовлень.",
            "Read-only. Each refresh rescans the entire accessible order history.",
          )}
        </p>
      </div>
      <div className="space-y-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 sm:p-5">
        <p className="break-words text-sm text-[var(--muted)]">
          {connection.configured
            ? copy("Налаштовано: ", "Configured: ") + connection.accountHost
            : copy("Не налаштовано", "Not configured")}
        </p>
        <p className="text-sm text-[var(--muted)]">
          {copy(
            "Адміністратор має дозволити точний HTTPS-домен магазину на сервері. Логін і пароль зберігаються зашифрованими та не повертаються у відповідях.",
            "An operator must allow the exact HTTPS shop origin on the server. Login and password are encrypted and never returned in responses.",
          )}
        </p>
        <p className="text-xs text-[var(--muted)]">
          {copy(
            "Ознака оплати не підтверджує дату повної оплати. Приходи, повернення, собівартість та історичні залишки недоступні; автоматична синхронізація вимкнена. Успішне читання не доводить відсутність прав запису — видайте окремий обмежений доступ.",
            "A paid flag does not establish a full-payment date. Receipts, refunds, costs and historical stock are unavailable; automatic sync is disabled. Successful reads do not prove the absence of write permissions: issue separate restricted credentials.",
          )}
        </p>
        {canManage ? (
          <form
            ref={form}
            onSubmit={submit}
            autoComplete="off"
            className="space-y-4"
            onChange={(e) => {
              if (
                (e.target as unknown as HTMLInputElement).name !==
                "mappingApproved"
              ) {
                setDirty(true);
                const approved =
                  form.current?.elements.namedItem("mappingApproved");
                if (approved instanceof HTMLInputElement)
                  approved.checked = false;
              }
            }}
          >
            <fieldset disabled={busy} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label={copy("HTTPS-адреса магазину", "Shop HTTPS origin")}
                >
                  <input
                    name="origin"
                    type="url"
                    required
                    className={control}
                    defaultValue={initial.accountHost ?? ""}
                    placeholder="https://shop.example.com…"
                    spellCheck={false}
                  />
                </Field>
                <Field label={copy("Часовий пояс магазину", "Shop timezone")}>
                  <input
                    name="timezone"
                    required
                    className={control}
                    defaultValue="Europe/Kyiv"
                    spellCheck={false}
                  />
                </Field>
                <Field label={copy("Логін інтеграції", "Integration login")}>
                  <input
                    name="login"
                    required
                    className={control}
                    autoComplete="off"
                    spellCheck={false}
                  />
                </Field>
                <Field
                  label={copy("Пароль інтеграції", "Integration password")}
                >
                  <input
                    name="password"
                    type="password"
                    required
                    className={control}
                    autoComplete="new-password"
                  />
                </Field>
                <Field label={copy("Версія правил", "Mapping revision")}>
                  <input
                    name="mappingRevision"
                    type="number"
                    min="1"
                    max="1000000"
                    step="1"
                    defaultValue="1"
                    required
                    className={control}
                  />
                </Field>
                <Field label={copy("Валюта ISO", "ISO currency")}>
                  <input
                    name="currency"
                    pattern="[A-Z]{3}"
                    required
                    defaultValue="UAH"
                    className={control}
                    spellCheck={false}
                  />
                </Field>
                <Field
                  label={copy(
                    "Підтверджений ліміт запитів",
                    "Confirmed request limit",
                  )}
                >
                  <input
                    name="requestsPerWindow"
                    type="number"
                    min="1"
                    max="100"
                    step="1"
                    required
                    className={control}
                  />
                </Field>
                <Field
                  label={copy(
                    "Період ліміту в секундах",
                    "Limit window in seconds",
                  )}
                >
                  <input
                    name="windowSeconds"
                    type="number"
                    min="1"
                    max="3600"
                    step="1"
                    required
                    className={control}
                  />
                </Field>
                <Field
                  label={copy(
                    "Підтверджена кількість модифікацій у каталозі (необов’язково)",
                    "Verified catalog modification count (optional)",
                  )}
                >
                  <input
                    name="catalogCount"
                    type="number"
                    min="0"
                    max="100000"
                    step="1"
                    className={control}
                  />
                </Field>
                <Field
                  label={copy(
                    "Назви складів через кому",
                    "Warehouse sync names, comma-separated",
                  )}
                >
                  <input
                    name="warehouses"
                    className={control}
                    spellCheck={false}
                  />
                </Field>
              </div>
              <StatusMappingFields
                rows={statuses}
                lang={lang}
                onChange={(rows) => {
                  setStatuses(rows);
                  setDirty(true);
                  const approved =
                    form.current?.elements.namedItem("mappingApproved");
                  if (approved instanceof HTMLInputElement)
                    approved.checked = false;
                }}
              />
              <p className="text-xs text-[var(--muted)]">
                {copy(
                  "Коди статусів дивіться після перевірки нижче. Не вважайте доставлене замовлення підтвердженим продажем без дати оплати.",
                  "Read status codes in the checks below. A delivered order is not a verified sale without a payment date.",
                )}
              </p>
              <Field
                label={copy(
                  "Посилання на підтвердження версії API, доступів, квоти й правил",
                  "API version, permissions, quota and mapping evidence reference",
                )}
              >
                <input
                  name="reference"
                  required
                  maxLength={200}
                  className={control}
                />
              </Field>
              {(
                [
                  [
                    "stableOrderPagination",
                    copy(
                      "Підтверджено стабільний порядок замовлень за offset без пропусків під час змін",
                      "Verified stable offset order pagination without skips during modifications",
                    ),
                  ],
                  [
                    "physicalStock",
                    copy(
                      "Підтверджено фізичні залишки на вказаних складах",
                      "Verified physical stock in the listed warehouses",
                    ),
                  ],
                  [
                    "netUnitPrice",
                    copy(
                      "Підтверджено ціну одиниці після знижок; комплекти й нерозподілені знижки залишаються невідомими",
                      "Verified net unit prices; bundles and unallocated discounts remain unknown",
                    ),
                  ],
                ] as const
              ).map(([name, label]) => (
                <label
                  key={name}
                  className="flex min-h-11 items-center gap-3 text-sm text-[var(--muted)]"
                >
                  <input type="checkbox" name={name} />
                  {label}
                </label>
              ))}
              <label className="flex min-h-11 items-center gap-3 text-sm text-[var(--muted)]">
                <input type="checkbox" name="mappingApproved" required />
                {copy(
                  "Погоджую зазначені правила та підтвердження. Неперевірені дані залишаються невідомими.",
                  "I approve the rules and referenced account evidence. Unverified data remains unknown.",
                )}
              </label>
              <div className="flex flex-wrap gap-3">
                <button className={button} disabled={busy}>
                  {busy
                    ? copy("Обробка…", "Processing…")
                    : copy("Зберегти Horoshop", "Save Horoshop")}
                </button>
                <button
                  type="button"
                  className={button}
                  disabled={busy || dirty || !connection.configured}
                  onClick={() => void perform("check")}
                >
                  {copy("Перевірити доступи", "Check read scopes")}
                </button>
              </div>
            </fieldset>
          </form>
        ) : null}
        {error ? (
          <p
            ref={alert}
            tabIndex={-1}
            role="alert"
            className="text-sm text-[var(--text)]"
          >
            {error}
          </p>
        ) : null}
        {status ? (
          <p role="status" className="text-sm text-[var(--muted)]">
            {status}
          </p>
        ) : null}
        <ConnectorDiagnostics check={connection.lastCheck} lang={lang} />
      </div>
    </section>
  );
}
