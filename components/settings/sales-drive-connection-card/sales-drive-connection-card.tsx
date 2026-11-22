"use client";

import { Button } from "@/components/ui/button/button";
import { Heading } from "@/components/ui/heading/heading";
import { Text } from "@/components/ui/text/text";
import { Note } from "@/components/ui/note/note";
import { Field } from "@/components/ui/field/field";
import { control } from "@/components/ui/control-styles/control-styles";
import { panel } from "@/components/ui/panel/panel-styles";
import { cn } from "@/lib/utils";
import { useRef, type FormEvent } from "react";
import { useConnectorConnection } from "../use-connector-connection";
import { salesDriveConnectionMessages } from "./connection-messages";
import { SalesDriveDiagnostics } from "../sales-drive-diagnostics/sales-drive-diagnostics";
import type { PublicConnection } from "@/lib/connectors/contract";
import { settingsSalesDriveConnectionCardMessages as englishCopy } from "@/messages/en.json";
import { settingsSalesDriveConnectionCardMessages as ukrainianCopy } from "@/messages/uk.json";

interface Props { initial: PublicConnection; lang: "uk" | "en"; canManage: boolean }

export default function SalesDriveConnectionCard({ initial, lang, canManage }: Props) {
  const uk = lang === "uk";
  const formRef = useRef<HTMLFormElement>(null);
  const { connection, activeAction: busy, status: message, error, alert: errorRef, setDirty, perform: mutateConnection } =
    useConnectorConnection("salesdrive", initial, lang, salesDriveConnectionMessages[lang]);

  function clearSecrets() {
    for (const name of ["ordersApiKey", "receiptsApiKey", "ymlUrl"]) {
      const field = formRef.current?.elements.namedItem(name);
      if (field instanceof HTMLInputElement) field.value = "";
    }
  }
  async function perform(action: "save" | "check", credentials?: Record<string, string>) {
    if (!canManage) return;
    await mutateConnection(action, credentials, action === "save" ? clearSecrets : undefined);
  }

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    void perform("save", Object.fromEntries(["accountHost", "ordersApiKey", "receiptsApiKey", "ymlUrl"].map((name) => [name, String(fields.get(name) ?? "")])));
  }

  const fieldClass = cn(control, "min-h-0 bg-(--input-bg)");
  const buttonClass = "min-h-0 font-medium text-(--text) hover:bg-(--input-hover)";

  return (
    <section id="salesdrive" className="mb-10 scroll-mt-6" aria-labelledby="salesdrive-heading">
      <Heading as="h2" variant="compact" id="salesdrive-heading" className="text-base">{englishCopy.salesDrive}</Heading>
      <Text variant="body" className="leading-normal text-inherit mt-1 mb-4 text-sm text-(--muted)">
        {uk ? ukrainianCopy.readOnlyAccessToOrdersProducts : englishCopy.readOnlyAccessToOrdersProducts}
      </Text>
      <div className={panel + " p-5 space-y-5"}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <Text variant="body" className="leading-normal text-inherit text-sm font-medium text-(--text)">{connection.accountHost ?? (uk ? ukrainianCopy.notConnected : englishCopy.notConnected)}</Text>
            <Text variant="body" className="leading-normal text-inherit mt-1 text-sm text-(--muted)">{!connection.configured ? uk ? ukrainianCopy.saveConfigurationToCheckAccess : englishCopy.saveConfigurationToCheckAccess
              : !connection.lastCheck ? uk ? ukrainianCopy.accessHasNotBeenChecked : englishCopy.accessHasNotBeenChecked
              : connection.lastCheck.ok ? uk ? ukrainianCopy.configuredSourcesAreAccessible : englishCopy.configuredSourcesAreAccessible
              : uk ? ukrainianCopy.connectionNeedsAttention : englishCopy.connectionNeedsAttention}</Text>
          </div>
          {canManage && connection.configured && <Button variant="report" type="button" className={buttonClass} disabled={busy !== null} onClick={() => void perform("check")}>
            {busy === "check" ? uk ? ukrainianCopy.checking : englishCopy.checking : uk ? ukrainianCopy.checkConnection : englishCopy.checkConnection}
          </Button>}
        </div>

        <Text variant="body" ref={errorRef} tabIndex={-1} role={error ? "alert" : undefined} className={error ? "text-sm text-red-400" : "sr-only"}>{error}</Text>
        <Text variant="body" role="status" aria-live="polite" className={message ? "text-sm text-(--text)" : "sr-only"}>{message}</Text>

        <SalesDriveDiagnostics check={connection.lastCheck} lang={lang} />

        {canManage ? <details className="border-t border-(--border) pt-4" open={!connection.configured}>
          <summary className="cursor-pointer text-sm font-medium text-(--text)">{uk ? ukrainianCopy.configureConnection : englishCopy.configureConnection}</summary>
          <form ref={formRef} onSubmit={save} onChange={() => setDirty(true)} className="mt-4 space-y-4">
            <Note className="leading-relaxed text-(--muted)">{uk
              ? ukrainianCopy.createAnOrdersReadKey
              : englishCopy.createAnOrdersReadKey}</Note>
            <fieldset disabled={busy !== null} className="space-y-4">
              <Field htmlFor="salesdrive-host" label={uk ? ukrainianCopy.labelAccountHostname : englishCopy.labelAccountHostname} className="gap-1 text-sm text-(--text)">
                <input id="salesdrive-host" name="accountHost" defaultValue={connection.accountHost ?? ""} required maxLength={100} autoComplete="off" spellCheck={false} placeholder={englishCopy.placeholderExampleSalesdriveMe} className={fieldClass} /></Field>
              <Field htmlFor="salesdrive-orders-key" label={uk ? ukrainianCopy.labelOrdersReadKey : englishCopy.labelOrdersReadKey} className="gap-1 text-sm text-(--text)">
                <input id="salesdrive-orders-key" type="password" name="ordersApiKey" required maxLength={512} autoComplete="off" spellCheck={false} className={fieldClass} /></Field>
              <Field htmlFor="salesdrive-receipts-key" label={uk ? ukrainianCopy.labelReceiptsReadKeyOptional : englishCopy.labelReceiptsReadKeyOptional} className="gap-1 text-sm text-(--text)">
                <input id="salesdrive-receipts-key" type="password" name="receiptsApiKey" maxLength={512} autoComplete="off" spellCheck={false} className={fieldClass} /></Field>
              <Field htmlFor="salesdrive-yml" label={uk ? ukrainianCopy.labelYMLLinkWithTokenOptional : englishCopy.labelYMLLinkWithTokenOptional} className="gap-1 text-sm text-(--text)">
                <input id="salesdrive-yml" type="password" name="ymlUrl" maxLength={2048} autoComplete="off" spellCheck={false} className={fieldClass} /></Field>
              <Button variant="report" type="submit" className={buttonClass}>{busy === "save" ? uk ? ukrainianCopy.saving : englishCopy.saving : uk ? ukrainianCopy.saveConnection : englishCopy.saveConnection}</Button>
            </fieldset>
          </form>
        </details> : <Note className="text-(--muted) leading-normal">{uk ? ukrainianCopy.anAdministratorCanConfigureOr : englishCopy.anAdministratorCanConfigureOr}</Note>}
      </div>
    </section>
  );
}
