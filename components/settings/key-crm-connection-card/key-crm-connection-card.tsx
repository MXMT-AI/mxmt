"use client";
import { useRef, useState, type FormEvent } from "react";
import { Field } from "@/components/ui/field/field";
import { control } from "@/components/ui/control-styles/control-styles";
import { Button } from "@/components/ui/button/button";
import { Heading } from "@/components/ui/heading/heading";
import { Text } from "@/components/ui/text/text";
import { Note } from "@/components/ui/note/note";
import { panel } from "@/components/ui/panel/panel-styles";
import { useConnectorConnection } from "../use-connector-connection";
import { keyCrmConnectionMessages } from "./connection-messages";
import { ChannelMappingFields } from "../channel-mapping-fields/channel-mapping-fields";
import StatusMappingFields from "../status-mapping-fields/status-mapping-fields";
import ConnectorDiagnostics from "../connector-diagnostics/connector-diagnostics";
import type { PublicConnection } from "@/lib/connectors/contract";
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
  const { connection, busy, error, status, dirty, alert, setError, setDirty, perform: mutateConnection } =
    useConnectorConnection("keycrm", initial, lang, keyCrmConnectionMessages[lang]);
  const [approved, setApproved] = useState(false),
    [net, setNet] = useState(false),
    [cost, setCost] = useState(false),
    [paid, setPaid] = useState(false),
    [stock, setStock] = useState(false);
  const form = useRef<HTMLFormElement>(null);
  const [statuses, setStatuses] = useState<Array<{ id: string; kind: string }>>(
      [],
    ),
    [channels, setChannels] = useState<Array<{ id: string; name: string }>>([]);
  const mutate = () => {
    setDirty(true);
    setApproved(false);
  };
  async function perform(action: "save" | "check", body?: unknown) {
    const result = await mutateConnection(action, body);
    if (!result) return;
    if (action === "save") {
      const key = form.current?.elements.namedItem("apiKey");
      if (key instanceof HTMLInputElement) key.value = "";
    } else {
      if (!statuses.length)
        setStatuses((result.lastCheck?.statuses.entries ?? []).slice(0, 100).map(s => ({ id: s.id, kind: "" })));
      if (!channels.length)
        setChannels((result.lastCheck?.channels.entries ?? []).slice(0, 100));
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
  return (
    <section
      id="keycrm"
      className="mb-10 scroll-mt-6 space-y-4"
      aria-labelledby="keycrm-heading"
    >
      <div>
        <Heading as="h2" variant="compact" id="keycrm-heading" className="text-base">
          KeyCRM
        </Heading>
        <Text variant="body" className="mt-1 max-w-3xl leading-normal text-(--muted)">
          {copy(
            "Лише читання з фіксованого API KeyCRM. Ключ зберігається зашифрованим і не повертається у відповідях.",
            "Read-only requests to the fixed KeyCRM API. The key is encrypted and never returned in responses.",
          )}
        </Text>
      </div>
      <div className={panel + " space-y-4 p-4 sm:p-5"}>
        <Text variant="body" className="leading-normal text-(--muted)">
          {connection.configured
            ? copy("Підключено: ", "Configured: ") + connection.accountHost
            : copy("Не налаштовано", "Not configured")}
          .{" "}
          {copy(
            "20 запитів/хв на ключ. Приходи й повернення не підтверджені; автоматична синхронізація вимкнена.",
            "20 requests/minute/key. Supplier receipts and refunds remain unverified; automatic sync is disabled.",
          )}
        </Text>
        <Note className="leading-normal">
          {copy(
            "Успішне читання не доводить, що ключ не має прав запису. Перевірте права виданого ключа в KeyCRM. Власність брендів, комісії й умови постачальників задаються окремо в Settings.",
            "Successful reads do not prove the key has no write permissions. Verify issued-key permissions in KeyCRM. Configure brand ownership, commissions and supplier terms separately in Settings.",
          )}
        </Note>
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
              <Note className="leading-normal">
                {copy(
                  "Використовуйте стабільний ID і часовий пояс для цього акаунту. Для зміни мапінгу підвищуйте версію; після оновлення повторно введіть ключ. Перше збереження може бути без підтвердженої фінансової моделі.",
                  "Keep account ID and timezone stable. Increase the revision when changing mappings and re-enter the key on updates. The first save can omit verified financial mappings.",
                )}
              </Note>
              <StatusMappingFields rows={statuses} lang={lang} onChange={rows=>{mutate();setStatuses(rows);}} />
              <ChannelMappingFields
                rows={channels.map(({ id, name }) => ({ code: id, name }))}
                lang={lang}
                buttonClassName="text-(--text) hover:bg-(--input-hover)"
                onChange={rows => {
                  mutate();
                  setChannels(rows.map(({ code, name }) => ({ id: code, name })));
                }}
              />
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
                  className="flex items-start gap-2 text-sm text-(--muted)"
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
              <details className="space-y-3 text-sm text-(--muted)">
                <summary className="cursor-pointer">
                  {copy(
                    "Підтверджений доступний період історії (необов’язково)",
                    "Verified accessible history interval (optional)",
                  )}
                </summary>
                <Text variant="body" className="leading-normal text-(--muted)">
                  {copy(
                    "Порожня відповідь не доводить повноту історії. Вкажіть лише звірений період і посилання на погоджені дані.",
                    "An empty response does not prove complete history. Enter only a reconciled interval and its approved evidence reference.",
                  )}
                </Text>
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
              <label className="flex items-start gap-2 text-sm text-(--text)">
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
                <Button variant="report" type="submit" className="text-(--text) hover:bg-(--input-hover)" disabled={busy}>
                  {busy
                    ? copy("Обробка…", "Processing…")
                    : copy("Зберегти KeyCRM", "Save KeyCRM")}
                </Button>
                <Button
                  variant="report"
                  className="text-(--text) hover:bg-(--input-hover)"
                  type="button"
                  disabled={busy || dirty || !connection.configured}
                  onClick={() => void perform("check")}
                >
                  {copy("Перевірити доступи", "Check read scopes")}
                </Button>
              </div>
            </fieldset>
          </form>
        )}
        {error && (
          <Text
            variant="body"
            ref={alert}
            tabIndex={-1}
            role="alert"
            className="leading-normal text-(--text)"
          >
            {error}
          </Text>
        )}
        {status && (
          <Text variant="body" role="status" className="leading-normal text-(--muted)">
            {status}
          </Text>
        )}
        <ConnectorDiagnostics check={connection.lastCheck} lang={lang} />
      </div>
    </section>
  );
}
