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
import type { PublicConnection } from "@/lib/connectors/contract";
import StatusMappingFields, {
  type StatusMappingRow,
} from "../status-mapping-fields/status-mapping-fields";
import ConnectorDiagnostics from "../connector-diagnostics/connector-diagnostics";
import { settingsHoroshopConnectionCardMessages as englishCopy } from "@/messages/en.json";
import { settingsHoroshopConnectionCardMessages as ukrainianCopy } from "@/messages/uk.json";
export default function HoroshopConnectionCard({
  initial,
  lang,
  canManage,
}: {
  initial: PublicConnection;
  lang: "uk" | "en";
  canManage: boolean;
}) {
  const copy = lang === "uk" ? ukrainianCopy : englishCopy;
  const {
    connection,
    busy,
    dirty,
    error,
    status,
    alert,
    setError,
    setDirty,
    perform: mutateConnection,
  } = useConnectorConnection("horoshop", initial, lang);
  const [statuses, setStatuses] = useState<StatusMappingRow[]>([]);
  const form = useRef<HTMLFormElement>(null);
  function invalidateApproval() {
    setDirty(true);
    const approved = form.current?.elements.namedItem("mappingApproved");
    if (approved instanceof HTMLInputElement) approved.checked = false;
  }
  async function perform(action: "save" | "check", body?: unknown) {
    const result = await mutateConnection(action, body);
    if (!result) return;
    if (action === "check" && !statuses.length)
      setStatuses(
        (result.lastCheck?.statuses.entries ?? [])
          .slice(0, 100)
          .map((s) => ({ id: s.id, kind: "" })),
      );
    if (action === "save")
      for (const name of ["login", "password"]) {
        const el = form.current?.elements.namedItem(name);
        if (el instanceof HTMLInputElement) el.value = "";
      }
  }
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const d = new FormData(e.currentTarget),
      value = (k: string) => String(d.get(k) ?? "");
    if (new Set(statuses.map((s) => s.id)).size !== statuses.length) {
      setError(
        copy.statusCodesMustBeUnique,
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
        <Heading as="h2" variant="compact" id="horoshop-heading" className="text-base">{englishCopy.horoshop}</Heading>
        <Text variant="body" className="mt-1 max-w-3xl leading-normal text-(--muted)">
          {copy.readOnlyEachRefreshRescansThe}
        </Text>
      </div>
      <div className={panel + " space-y-4 p-4 sm:p-5"}>
        <Text variant="body" className="wrap-break-word leading-normal text-(--muted)">
          {connection.configured
            ? copy.configured + connection.accountHost
            : copy.notConfigured}
        </Text>
        <Text variant="body" className="leading-normal text-(--muted)">
          {copy.anOperatorMustAllowThe}
        </Text>
        <Note className="leading-normal">
          {copy.aPaidFlagDoesNot}
        </Note>
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
                invalidateApproval();
              }
            }}
          >
            <fieldset disabled={busy} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label={copy.shopHTTPSOrigin}
                >
                  <input
                    name="origin"
                    type="url"
                    required
                    className={control}
                    defaultValue={initial.accountHost ?? ""}
                    placeholder={englishCopy.placeholderHttpsShopExampleCom}
                    spellCheck={false}
                  />
                </Field>
                <Field label={copy.shopTimezone}>
                  <input
                    name="timezone"
                    required
                    className={control}
                    defaultValue="Europe/Kyiv"
                    spellCheck={false}
                  />
                </Field>
                <Field label={copy.integrationLogin}>
                  <input
                    name="login"
                    required
                    className={control}
                    autoComplete="off"
                    spellCheck={false}
                  />
                </Field>
                <Field
                  label={copy.integrationPassword}
                >
                  <input
                    name="password"
                    type="password"
                    required
                    className={control}
                    autoComplete="new-password"
                  />
                </Field>
                <Field label={copy.mappingRevision}>
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
                <Field label={copy.iSOCurrency}>
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
                  label={copy.confirmedRequestLimit}
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
                  label={copy.limitWindowInSeconds}
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
                  label={copy.verifiedCatalogModificationCountOptional}
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
                  label={copy.warehouseSyncNamesCommaSeparated}
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
                  invalidateApproval();
                }}
              />
              <p className="text-xs text-(--muted)">
                {copy.readStatusCodesInThe}
              </p>
              <Field
                label={copy.aPIVersionPermissionsQuotaAnd}
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
                    copy.verifiedStableOffsetOrderPagination,
                  ],
                  [
                    "physicalStock",
                    copy.verifiedPhysicalStockInThe,
                  ],
                  [
                    "netUnitPrice",
                    copy.verifiedNetUnitPricesBundles,
                  ],
                ] as const
              ).map(([name, label]) => (
                <label
                  key={name}
                  className="flex min-h-11 items-center gap-3 text-sm text-(--muted)"
                >
                  <input type="checkbox" name={name} />
                  {label}
                </label>
              ))}
              <label className="flex min-h-11 items-center gap-3 text-sm text-(--muted)">
                <input type="checkbox" name="mappingApproved" required />
                {copy.iApproveTheRulesAnd}
              </label>
              <div className="flex flex-wrap gap-3">
                <Button variant="report" type="submit" className="text-(--text) hover:bg-(--input-hover)" disabled={busy}>
                  {busy
                    ? copy.processing
                    : copy.saveHoroshop}
                </Button>
                <Button
                  variant="report"
                  type="button"
                  className="text-(--text) hover:bg-(--input-hover)"
                  disabled={busy || dirty || !connection.configured}
                  onClick={() => void perform("check")}
                >
                  {copy.checkReadScopes}
                </Button>
              </div>
            </fieldset>
          </form>
        ) : null}
        {error ? (
          <Text
            variant="body"
            ref={alert}
            tabIndex={-1}
            role="alert"
            className="leading-normal text-(--text)"
          >
            {error}
          </Text>
        ) : null}
        {status ? (
          <Text variant="body" role="status" className="leading-normal text-(--muted)">
            {status}
          </Text>
        ) : null}
        <ConnectorDiagnostics check={connection.lastCheck} lang={lang} />
      </div>
    </section>
  );
}
