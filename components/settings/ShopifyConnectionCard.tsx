"use client";
import { useRef, type FormEvent } from "react";
import { Field, control } from "@/components/merchandising/FormControls";
import type { PublicConnection } from "@/lib/connectors/contract";
import { useConnectorConnection } from "./useConnectorConnection";
import ConnectorDiagnostics from "./ConnectorDiagnostics";
const button =
  "min-h-11 rounded-lg border border-[var(--border)] px-4 py-2 text-sm text-[var(--text)] hover:bg-[var(--input-hover)] focus-visible:outline focus-visible:outline-2 disabled:opacity-50";
/** Shopify evidence remains an explicit owner decision; saving never selects a reporting source. */
export default function ShopifyConnectionCard({
  initial,
  lang,
  canManage,
}: {
  initial: PublicConnection;
  lang: "uk" | "en";
  canManage: boolean;
}) {
  const copy = (uk: string, en: string) => (lang === "uk" ? uk : en),
    form = useRef<HTMLFormElement>(null);
  const { connection, busy, dirty, error, status, alert, setDirty, perform } =
    useConnectorConnection("shopify", initial, lang);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const d = new FormData(e.currentTarget),
      value = (k: string) => String(d.get(k) ?? ""),
      from = value("historyFrom"),
      to = value("historyTo");
    const result = await perform("save", {
      shop: value("shop"),
      appId: value("appId"),
      accessToken: value("accessToken"),
      timezone: value("timezone"),
      mappingRevision: Number(value("mappingRevision")),
      evidence: {
        reference: value("reference"),
        currency: value("currency"),
        physicalStock: d.has("physicalStock"),
        financials: d.has("financials"),
        locationIds: value("locationIds")
          .split(",")
          .map((v) => v.trim())
          .filter(Boolean),
        history:
          from || to
            ? { from, to, reference: value("historyReference") }
            : null,
      },
    });
    if (result) {
      const el = form.current?.elements.namedItem("accessToken");
      if (el instanceof HTMLInputElement) el.value = "";
    }
  }
  return (
    <section
      id="shopify"
      aria-labelledby="shopify-heading"
      className="mb-10 scroll-mt-6 space-y-4"
    >
      <div>
        <h2 id="shopify-heading" className="font-semibold text-[var(--text)]">
          Shopify
        </h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          {copy(
            "Лише читання через Shopify Admin API 2026-10. Вкладені сторінки зберігаються до завершення запису.",
            "Read-only Shopify Admin API 2026-10. Nested pages are retained until the record is complete.",
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
            "Використовуйте постійний домен myshopify.com і окремий токен із правами read_orders, read_products, read_inventory та read_locations. Вартість товарів потребує дозволу перегляду собівартості. Токен шифрується та не повертається у відповідях.",
            "Use the permanent myshopify.com domain and a separate token with read_orders, read_products, read_inventory and read_locations. Product costs require cost-view permission. The token is encrypted and never returned in responses.",
          )}
        </p>
        <p className="text-xs text-[var(--muted)]">
          {copy(
            "Типовий доступ до замовлень охоплює 60 днів. Для старішої історії потрібні read_all_orders та погоджений еталон; порожня відповідь не підтверджує повноту. Перевірка читання не доводить відсутність прав запису. Приходи й історична собівартість недоступні; автоматична синхронізація вимкнена.",
            "Default order access covers 60 days. Older history requires read_all_orders and approved evidence; an empty response does not prove coverage. Successful reads do not prove the absence of write permissions. Receipts and historical COGS are unavailable; automatic sync is disabled.",
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
                const el = form.current?.elements.namedItem("mappingApproved");
                if (el instanceof HTMLInputElement) el.checked = false;
              }
            }}
          >
            <fieldset disabled={busy} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label={copy(
                    "Постійний домен Shopify",
                    "Permanent Shopify domain",
                  )}
                >
                  <input
                    name="shop"
                    required
                    defaultValue={initial.accountHost ?? ""}
                    pattern="[a-z0-9-]+\.myshopify\.com"
                    placeholder="store.myshopify.com…"
                    spellCheck={false}
                    className={control}
                  />
                </Field>
                <Field label={copy("ID застосунку Shopify", "Shopify app ID")}>
                  <input
                    name="appId"
                    required
                    placeholder="gid://shopify/App/123…"
                    spellCheck={false}
                    className={control}
                  />
                </Field>
                <Field
                  label={copy("Токен Admin API", "Admin API access token")}
                >
                  <input
                    name="accessToken"
                    required
                    type="password"
                    autoComplete="new-password"
                    spellCheck={false}
                    className={control}
                  />
                </Field>
                <Field label={copy("Часовий пояс магазину", "Shop timezone")}>
                  <input
                    name="timezone"
                    required
                    defaultValue="Europe/Kyiv"
                    spellCheck={false}
                    className={control}
                  />
                </Field>
                <Field label={copy("Версія правил", "Mapping revision")}>
                  <input
                    name="mappingRevision"
                    required
                    type="number"
                    min="1"
                    max="1000000"
                    step="1"
                    defaultValue="1"
                    className={control}
                  />
                </Field>
                <Field label={copy("Валюта магазину ISO", "Shop ISO currency")}>
                  <input
                    name="currency"
                    required
                    defaultValue="UAH"
                    pattern="[A-Z]{3}"
                    spellCheck={false}
                    className={control}
                  />
                </Field>
              </div>
              <Field
                label={copy(
                  "ID локацій через кому",
                  "Location IDs, comma-separated",
                )}
              >
                <input
                  name="locationIds"
                  placeholder="gid://shopify/Location/123…"
                  spellCheck={false}
                  className={control}
                />
              </Field>
              <Field
                label={copy(
                  "Посилання на погодження доступів і правил",
                  "Access and mapping approval reference",
                )}
              >
                <input
                  name="reference"
                  required
                  maxLength={200}
                  className={control}
                />
              </Field>
              <label className="flex min-h-11 items-center gap-3 text-sm text-[var(--muted)]">
                <input type="checkbox" name="physicalStock" />
                {copy(
                  "Підтверджую фізичний on_hand для вказаних локацій; available не замінює фізичні залишки.",
                  "I approve physical on_hand for the listed locations; available is not physical stock.",
                )}
              </label>
              <label className="flex min-h-11 items-center gap-3 text-sm text-[var(--muted)]">
                <input type="checkbox" name="financials" />
                {copy(
                  "Погоджую shopMoney, товарні суми без податків і доставки, розподілені знижки та окремі успішні події оплати/повернення.",
                  "I approve shopMoney merchandise amounts excluding tax/shipping, allocated discounts and separate successful payment/refund events.",
                )}
              </label>
              <details>
                <summary className="min-h-11 cursor-pointer py-2 text-sm text-[var(--text)] focus-visible:outline">
                  {copy(
                    "Підтверджена історія (необов’язково)",
                    "Verified history (optional)",
                  )}
                </summary>
                <div className="space-y-4 pt-2">
                  <Field
                    label={copy("Початок історії UTC", "History start UTC")}
                  >
                    <input
                      name="historyFrom"
                      placeholder="2024-10-27T00:00:00Z…"
                      spellCheck={false}
                      className={control}
                    />
                  </Field>
                  <Field label={copy("Кінець історії UTC", "History end UTC")}>
                    <input
                      name="historyTo"
                      placeholder="2026-10-27T00:00:00Z…"
                      spellCheck={false}
                      className={control}
                    />
                  </Field>
                  <Field
                    label={copy(
                      "Посилання на звірку історії",
                      "History reconciliation reference",
                    )}
                  >
                    <input
                      name="historyReference"
                      maxLength={200}
                      className={control}
                    />
                  </Field>
                </div>
              </details>
              <p className="text-xs text-[var(--muted)]">
                {copy(
                  "Коди подій: 1 — повна оплата, 2 — повернення, 3 — непідтверджена/часткова оплата, 4 — скасування без оплати. Перевірте загальні правила статусів клієнта перед імпортом.",
                  "Event codes: 1 full payment, 2 refund, 3 unverified/partial payment, 4 unpaid cancellation. Review client-wide status rules before importing.",
                )}
              </p>
              <label className="flex min-h-11 items-center gap-3 text-sm text-[var(--muted)]">
                <input type="checkbox" name="mappingApproved" required />
                {copy(
                  "Погоджую вибрані правила та вказані еталони. Непідтверджені дані залишаються невідомими.",
                  "I approve the selected rules and referenced evidence. Unverified facts remain unknown.",
                )}
              </label>
              <div className="flex flex-wrap gap-3">
                <button disabled={busy} className={button}>
                  {busy
                    ? copy("Обробка…", "Processing…")
                    : copy("Зберегти Shopify", "Save Shopify")}
                </button>
                <button
                  type="button"
                  disabled={busy || dirty || !connection.configured}
                  onClick={() => void perform("check")}
                  className={button}
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
