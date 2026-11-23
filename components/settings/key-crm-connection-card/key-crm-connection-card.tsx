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
import { settingsKeyCrmConnectionCardMessages as englishCopy } from "@/messages/en.json";
import { settingsKeyCrmConnectionCardMessages as ukrainianCopy } from "@/messages/uk.json";
export default function KeyCrmConnectionCard({
  initial,
  lang,
  canManage,
}: {
  initial: PublicConnection;
  lang: "uk" | "en";
  canManage: boolean;
}) {
  const copy = lang === "uk" ? ukrainianCopy : englishCopy;
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
        copy.statusChannelCodesMustBeUnique,
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
        <Heading as="h2" variant="compact" id="keycrm-heading" className="text-base">{englishCopy.keyCRM}</Heading>
        <Text variant="body" className="mt-1 max-w-3xl leading-normal text-(--muted)">
          {copy.readOnlyRequestsToTheFixed}
        </Text>
      </div>
      <div className={panel + " space-y-4 p-4 sm:p-5"}>
        <Text variant="body" className="leading-normal text-(--muted)">
          {connection.configured
            ? copy.configured + connection.accountHost
            : copy.notConfigured}
          .{" "}
          {copy["20RequestsMinuteKeySupplierReceiptsAnd"]}
        </Text>
        <Note className="leading-normal">
          {copy.successfulReadsDoNotProve}
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
                {copy.keyCRMSettings}
              </legend>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label={copy.logicalAccountIDNotThe}
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
                <Field label={copy.aPIKey}>
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
                  label={copy.reportingTimezone}
                >
                  <input
                    name="timezone"
                    className={control}
                    defaultValue="Europe/Kyiv"
                    required
                    maxLength={100}
                  />
                </Field>
                <Field label={copy.mappingRevision}>
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
                {copy.keepAccountIDAndTimezone}
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
                <Field label={copy.verifiedCurrency}>
                  <input
                    name="currency"
                    className={control}
                    placeholder={englishCopy.placeholderUAH}
                    pattern="[A-Z]{3}"
                    maxLength={3}
                    required={approved}
                  />
                </Field>
                <Field
                  label={copy.approvedMappingReference}
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
                  copy.priceSoldIsTheNetUnit,
                ],
                [
                  cost,
                  setCost,
                  copy.purchasedPriceIsVerifiedUnitCost,
                ],
                [
                  paid,
                  setPaid,
                  copy.fullPaymentDateIsThe,
                ],
                [
                  stock,
                  setStock,
                  copy.quantityIsPhysicalStockIncluding,
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
                label={copy.includedWarehouseIDsCommaSeparatedEmpty}
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
                  {copy.verifiedAccessibleHistoryIntervalOptional}
                </summary>
                <Text variant="body" className="leading-normal text-(--muted)">
                  {copy.anEmptyResponseDoesNot}
                </Text>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label={copy.fromISOUTC}>
                    <input
                      className={control}
                      name="historyFrom"
                      placeholder={englishCopy.placeholder20250101T000000000Z}
                    />
                  </Field>
                  <Field label={copy.toISOUTC}>
                    <input
                      className={control}
                      name="historyTo"
                      placeholder={englishCopy.placeholder20261025T235959999Z}
                    />
                  </Field>
                </div>
                <Field
                  label={copy.historyEvidenceReference}
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
                {copy.iApproveTheSelectedRules}
              </label>
              <div className="flex flex-wrap gap-3">
                <Button variant="report" type="submit" className="text-(--text) hover:bg-(--input-hover)" disabled={busy}>
                  {busy
                    ? copy.processing
                    : copy.saveKeyCRM}
                </Button>
                <Button
                  variant="report"
                  className="text-(--text) hover:bg-(--input-hover)"
                  type="button"
                  disabled={busy || dirty || !connection.configured}
                  onClick={() => void perform("check")}
                >
                  {copy.checkReadScopes}
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
