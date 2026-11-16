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
      <Heading as="h2" variant="compact" id="salesdrive-heading" className="text-base">SalesDrive</Heading>
      <Text variant="body" className="leading-normal text-inherit mt-1 mb-4 text-sm text-(--muted)">
        {uk ? "Підключення лише для читання замовлень, товарів, залишків і надходжень." : "Read-only access to orders, products, stock and receipts."}
      </Text>
      <div className={panel + " p-5 space-y-5"}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <Text variant="body" className="leading-normal text-inherit text-sm font-medium text-(--text)">{connection.accountHost ?? (uk ? "Не підключено" : "Not connected")}</Text>
            <Text variant="body" className="leading-normal text-inherit mt-1 text-sm text-(--muted)">{!connection.configured ? uk ? "Збережіть налаштування для перевірки доступу." : "Save configuration to check access."
              : !connection.lastCheck ? uk ? "Доступ ще не перевірено" : "Access has not been checked"
              : connection.lastCheck.ok ? uk ? "Налаштовані джерела доступні" : "Configured sources are accessible"
              : uk ? "З’єднання потребує уваги" : "Connection needs attention"}</Text>
          </div>
          {canManage && connection.configured && <Button variant="report" type="button" className={buttonClass} disabled={busy !== null} onClick={() => void perform("check")}>
            {busy === "check" ? uk ? "Перевіряємо…" : "Checking…" : uk ? "Перевірити з’єднання" : "Check connection"}
          </Button>}
        </div>

        <Text variant="body" ref={errorRef} tabIndex={-1} role={error ? "alert" : undefined} className={error ? "text-sm text-red-400" : "sr-only"}>{error}</Text>
        <Text variant="body" role="status" aria-live="polite" className={message ? "text-sm text-(--text)" : "sr-only"}>{message}</Text>

        <SalesDriveDiagnostics check={connection.lastCheck} lang={lang} />

        {canManage ? <details className="border-t border-(--border) pt-4" open={!connection.configured}>
          <summary className="cursor-pointer text-sm font-medium text-(--text)">{uk ? "Налаштувати з’єднання" : "Configure connection"}</summary>
          <form ref={formRef} onSubmit={save} onChange={() => setDirty(true)} className="mt-4 space-y-4">
            <Note className="leading-relaxed text-(--muted)">{uk
              ? "Створіть ключ читання замовлень на рівні бази та окремий ключ читання надходжень на рівні акаунту. Увімкніть YML-експорт. Ключі та посилання не відображаються після збереження. Для заміни введіть їх знову; порожні необов’язкові поля вимикають відповідний доступ."
              : "Create an orders read key at form level and a receipts read key at account level. Enable YML export. Saved keys and the feed link are never displayed. Re-enter them to replace the configuration; blank optional fields disable that access."}</Note>
            <fieldset disabled={busy !== null} className="space-y-4">
              <Field htmlFor="salesdrive-host" label={uk ? "Домен акаунту" : "Account hostname"} className="gap-1 text-sm text-(--text)">
                <input id="salesdrive-host" name="accountHost" defaultValue={connection.accountHost ?? ""} required maxLength={100} autoComplete="off" spellCheck={false} placeholder="example.salesdrive.me…" className={fieldClass} /></Field>
              <Field htmlFor="salesdrive-orders-key" label={uk ? "Ключ читання замовлень" : "Orders read key"} className="gap-1 text-sm text-(--text)">
                <input id="salesdrive-orders-key" type="password" name="ordersApiKey" required maxLength={512} autoComplete="off" spellCheck={false} className={fieldClass} /></Field>
              <Field htmlFor="salesdrive-receipts-key" label={uk ? "Ключ читання надходжень (необов’язково)" : "Receipts read key (optional)"} className="gap-1 text-sm text-(--text)">
                <input id="salesdrive-receipts-key" type="password" name="receiptsApiKey" maxLength={512} autoComplete="off" spellCheck={false} className={fieldClass} /></Field>
              <Field htmlFor="salesdrive-yml" label={uk ? "YML-посилання з токеном (необов’язково)" : "YML link with token (optional)"} className="gap-1 text-sm text-(--text)">
                <input id="salesdrive-yml" type="password" name="ymlUrl" maxLength={2048} autoComplete="off" spellCheck={false} className={fieldClass} /></Field>
              <Button variant="report" type="submit" className={buttonClass}>{busy === "save" ? uk ? "Зберігаємо…" : "Saving…" : uk ? "Зберегти з’єднання" : "Save connection"}</Button>
            </fieldset>
          </form>
        </details> : <Note className="text-(--muted) leading-normal">{uk ? "Змінити або перевірити з’єднання може адміністратор." : "An administrator can configure or check the connection."}</Note>}
      </div>
    </section>
  );
}
