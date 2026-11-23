"use client";
import { Button } from "@/components/ui/button/button";
import { Heading } from "@/components/ui/heading/heading";
import { Text } from "@/components/ui/text/text";
import { Note } from "@/components/ui/note/note";
import { panel } from "@/components/ui/panel/panel-styles";
import { useRef, type FormEvent } from "react";
import { Field } from "@/components/ui/field/field";
import { control } from "@/components/ui/control-styles/control-styles";
import type { PublicConnection } from "@/lib/connectors/contract";
import { useConnectorConnection } from "../use-connector-connection";
import ConnectorDiagnostics from "../connector-diagnostics/connector-diagnostics";
import { settingsShopifyConnectionCardMessages as englishCopy } from "@/messages/en.json";
import { settingsShopifyConnectionCardMessages as ukrainianCopy } from "@/messages/uk.json";
export default function ShopifyConnectionCard({
  initial,
  lang,
  canManage,
}: {
  initial: PublicConnection;
  lang: "uk" | "en";
  canManage: boolean;
}) {
  const copy = lang === "uk" ? ukrainianCopy : englishCopy,
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
        <Heading as="h2" variant="compact" id="shopify-heading" className="text-base">{englishCopy.shopify}</Heading>
        <Text variant="body" className="leading-normal mt-1 text-sm text-(--muted)">
          {copy.readOnlyShopifyAdminAPI202610}
        </Text>
      </div>
      <div className={panel + " space-y-4 p-4 sm:p-5"}>
        <Text variant="body" className="leading-normal wrap-break-word text-sm text-(--muted)">
          {connection.configured
            ? copy.configured + connection.accountHost
            : copy.notConfigured}
        </Text>
        <Text variant="body" className="leading-normal text-sm text-(--muted)">
          {copy.useThePermanentMyshopifyComDomain}
        </Text>
        <Note className="leading-normal text-(--muted)">
          {copy.defaultOrderAccessCovers60}
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
                setDirty(true);
                const el = form.current?.elements.namedItem("mappingApproved");
                if (el instanceof HTMLInputElement) el.checked = false;
              }
            }}
          >
            <fieldset disabled={busy} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label={copy.permanentShopifyDomain}
                >
                  <input
                    name="shop"
                    required
                    defaultValue={initial.accountHost ?? ""}
                    pattern="[a-z0-9-]+\.myshopify\.com"
                    placeholder={englishCopy.placeholderStoreMyshopifyCom}
                    spellCheck={false}
                    className={control}
                  />
                </Field>
                <Field label={copy.shopifyAppID}>
                  <input
                    name="appId"
                    required
                    placeholder={englishCopy.placeholderGidShopifyApp123}
                    spellCheck={false}
                    className={control}
                  />
                </Field>
                <Field
                  label={copy.adminAPIAccessToken}
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
                <Field label={copy.shopTimezone}>
                  <input
                    name="timezone"
                    required
                    defaultValue="Europe/Kyiv"
                    spellCheck={false}
                    className={control}
                  />
                </Field>
                <Field label={copy.mappingRevision}>
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
                <Field label={copy.shopISOCurrency}>
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
                label={copy.locationIDsCommaSeparated}
              >
                <input
                  name="locationIds"
                  placeholder={englishCopy.placeholderGidShopifyLocation123}
                  spellCheck={false}
                  className={control}
                />
              </Field>
              <Field
                label={copy.accessAndMappingApprovalReference}
              >
                <input
                  name="reference"
                  required
                  maxLength={200}
                  className={control}
                />
              </Field>
              <label className="flex min-h-11 items-center gap-3 text-sm text-(--muted)">
                <input type="checkbox" name="physicalStock" />
                {copy.iApprovePhysicalOnHandFor}
              </label>
              <label className="flex min-h-11 items-center gap-3 text-sm text-(--muted)">
                <input type="checkbox" name="financials" />
                {copy.iApproveShopMoneyMerchandiseAmounts}
              </label>
              <details>
                <summary className="min-h-11 cursor-pointer py-2 text-sm text-(--text) focus-visible:outline-solid">
                  {copy.verifiedHistoryOptional}
                </summary>
                <div className="space-y-4 pt-2">
                  <Field
                    label={copy.historyStartUTC}
                  >
                    <input
                      name="historyFrom"
                      placeholder={englishCopy.placeholder20241027T000000Z}
                      spellCheck={false}
                      className={control}
                    />
                  </Field>
                  <Field label={copy.historyEndUTC}>
                    <input
                      name="historyTo"
                      placeholder={englishCopy.placeholder20261027T000000Z}
                      spellCheck={false}
                      className={control}
                    />
                  </Field>
                  <Field
                    label={copy.historyReconciliationReference}
                  >
                    <input
                      name="historyReference"
                      maxLength={200}
                      className={control}
                    />
                  </Field>
                </div>
              </details>
              <Note className="leading-normal text-(--muted)">
                {copy.eventCodes1FullPayment}
              </Note>
              <label className="flex min-h-11 items-center gap-3 text-sm text-(--muted)">
                <input type="checkbox" name="mappingApproved" required />
                {copy.iApproveTheSelectedRules}
              </label>
              <div className="flex flex-wrap gap-3">
                <Button variant="report" type="submit" disabled={busy} className="text-(--text) hover:bg-(--input-hover)">
                  {busy
                    ? copy.processing
                    : copy.saveShopify}
                </Button>
                <Button variant="report"
                  type="button"
                  disabled={busy || dirty || !connection.configured}
                  onClick={() => void perform("check")}
                  className="text-(--text) hover:bg-(--input-hover)"
                >
                  {copy.checkReadScopes}
                </Button>
              </div>
            </fieldset>
          </form>
        ) : null}
        {error ? (
          <Text variant="body"
            ref={alert}
            tabIndex={-1}
            role="alert"
            className="leading-normal text-sm text-(--text)"
          >
            {error}
          </Text>
        ) : null}
        {status ? (
          <Text variant="body" role="status" className="leading-normal text-sm text-(--muted)">
            {status}
          </Text>
        ) : null}
        <ConnectorDiagnostics check={connection.lastCheck} lang={lang} />
      </div>
    </section>
  );
}
