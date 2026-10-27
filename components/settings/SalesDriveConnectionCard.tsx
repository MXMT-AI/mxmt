"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { apiFetch } from "@/lib/fetch";
import { readApiJson } from "@/lib/api-response";
import { connectorCheckLabels } from "@/lib/connectors/check-copy";
import type { PublicConnection } from "@/lib/connectors/contract";

interface Props { initial: PublicConnection; lang: "uk" | "en"; canManage: boolean }

/** Write-only credential form with public, persisted read-scope diagnostics. */
export default function SalesDriveConnectionCard({ initial, lang, canManage }: Props) {
  const uk = lang === "uk";
  const [connection, setConnection] = useState(initial);
  const [busy, setBusy] = useState<"save" | "check" | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [dirty, setDirty] = useState(false);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => { if (error) errorRef.current?.focus(); }, [error]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  async function perform(action: "save" | "check", credentials?: Record<string, string>) {
    setBusy(action); setError(""); setMessage("");
    try {
      const response = await apiFetch("/api/connectors/salesdrive", {
        method: action === "save" ? "PUT" : "POST",
        ...(credentials ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(credentials) } : {}),
      });
      const result = await readApiJson<Record<string, unknown>>(response);
      if (!response.ok) {
        const code = String(result.code);
        setError(code === "CONNECTOR_STORAGE_UNAVAILABLE"
          ? uk ? "Захищене зберігання недоступне. Зверніться до адміністратора." : "Secure storage is unavailable. Contact your administrator."
          : code === "VALIDATION_ERROR"
          ? uk ? "Перевірте домен SalesDrive, ключ читання замовлень і YML-посилання цього акаунту." : "Check the SalesDrive hostname, orders read key and YML link for this account."
          : uk ? "Не вдалося виконати запит. Спробуйте ще раз." : "The request failed. Try again.");
        return;
      }
      setConnection(result as unknown as PublicConnection);
      window.dispatchEvent(new Event("connector-connection-changed"));
      setMessage(action === "save"
        ? uk ? "З’єднання збережено. Тепер перевірте доступ." : "Connection saved. Check access next."
        : uk ? "Перевірку завершено. Результати наведені нижче." : "Check complete. Review the results below.");
      if (action === "save") setDirty(false);
    } catch { setError(uk ? "Помилка мережі. Спробуйте ще раз." : "Network error. Try again."); }
    finally {
      // Clear write-only fields after every attempt; never store them in local/session storage.
      if (action === "save") for (const name of ["ordersApiKey", "receiptsApiKey", "ymlUrl"]) {
        const field = formRef.current?.elements.namedItem(name);
        if (field instanceof HTMLInputElement) field.value = "";
      }
      setBusy(null);
    }
  }

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    void perform("save", Object.fromEntries(["accountHost", "ordersApiKey", "receiptsApiKey", "ymlUrl"].map((name) => [name, String(fields.get(name) ?? "")])));
  }

  const checkLabels = connectorCheckLabels(lang);
  const resourceLabels = { orders: uk ? "Замовлення" : "Orders", statuses: uk ? "Статуси" : "Statuses",
    receipts: uk ? "Надходження" : "Receipts", products:uk?"Товари":"Products",offers:uk?"Варіанти":"Offers",stock:uk?"Залишки":"Stock",channels:uk?"Канали":"Channels",catalog: uk ? "Товари та залишки" : "Products and stock" };
  const fieldClass = "mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--input-bg)] px-3 py-2 text-sm text-[var(--text)]";
  const buttonClass = "rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium text-[var(--text)] hover:bg-[var(--input-hover)] disabled:opacity-50";

  return (
    <section id="salesdrive" className="mb-10 scroll-mt-6" aria-labelledby="salesdrive-heading">
      <h2 id="salesdrive-heading" className="font-semibold text-[var(--text)]">SalesDrive</h2>
      <p className="mt-1 mb-4 text-sm text-[var(--muted)]">
        {uk ? "Підключення лише для читання замовлень, товарів, залишків і надходжень." : "Read-only access to orders, products, stock and receipts."}
      </p>
      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-[var(--text)]">{connection.accountHost ?? (uk ? "Не підключено" : "Not connected")}</p>
            <p className="mt-1 text-sm text-[var(--muted)]">{!connection.configured ? uk ? "Збережіть налаштування для перевірки доступу." : "Save configuration to check access."
              : !connection.lastCheck ? uk ? "Доступ ще не перевірено" : "Access has not been checked"
              : connection.lastCheck.ok ? uk ? "Налаштовані джерела доступні" : "Configured sources are accessible"
              : uk ? "З’єднання потребує уваги" : "Connection needs attention"}</p>
          </div>
          {canManage && connection.configured && <button type="button" className={buttonClass} disabled={busy !== null} onClick={() => void perform("check")}>
            {busy === "check" ? uk ? "Перевіряємо…" : "Checking…" : uk ? "Перевірити з’єднання" : "Check connection"}
          </button>}
        </div>

        <p ref={errorRef} tabIndex={-1} role={error ? "alert" : undefined} className={error ? "text-sm text-red-400" : "sr-only"}>{error}</p>
        <p role="status" aria-live="polite" className={message ? "text-sm text-[var(--text)]" : "sr-only"}>{message}</p>

        {connection.lastCheck && <div className="space-y-3">
          <p className="text-xs text-[var(--muted)]">{uk ? "Перевірено: " : "Checked: "}{new Intl.DateTimeFormat(uk ? "uk-UA" : "en-GB", { timeZone: "Europe/Kyiv", dateStyle: "medium", timeStyle: "short" }).format(new Date(connection.lastCheck.checkedAt))}</p>
          <dl className="space-y-2 text-sm">{connection.lastCheck.checks.map((check) => <div key={check.resource} className="flex flex-wrap justify-between gap-2">
            <dt className="text-[var(--text)]">{resourceLabels[check.resource]}</dt>
            <dd className={check.code === "OK" ? "font-medium text-[var(--text)]" : "text-[var(--muted)]"}>{checkLabels[check.code]}</dd>
          </div>)}</dl>
          {(["statuses", "channels"] as const).map((key) => <details key={key} className="border-t border-[var(--border)] pt-3">
            <summary className="cursor-pointer text-sm text-[var(--text)]">{key === "statuses" ? resourceLabels.statuses : uk ? "Канали" : "Channels"} ({new Intl.NumberFormat(lang).format(connection.lastCheck![key].entries.length)})</summary>
            {!connection.lastCheck![key].complete && <p className="mt-2 text-xs text-[var(--muted)]">{uk ? "Довідник неповний або потребує підтвердження даними клієнта." : "The dictionary is incomplete or requires customer verification."}</p>}
            <ul className="mt-2 max-h-56 overflow-auto text-sm text-[var(--text)]">{connection.lastCheck![key].entries.slice(0, 50).map((entry) => <li className="break-words py-1" key={entry.id}>{entry.id}: {entry.name}</li>)}</ul>
            {connection.lastCheck![key].entries.length > 50 && <p className="text-xs text-[var(--muted)]">{uk ? "Показано перші 50 записів." : "Showing the first 50 entries."}</p>}
          </details>)}
        </div>}

        {canManage ? <details className="border-t border-[var(--border)] pt-4" open={!connection.configured}>
          <summary className="cursor-pointer text-sm font-medium text-[var(--text)]">{uk ? "Налаштувати з’єднання" : "Configure connection"}</summary>
          <form ref={formRef} onSubmit={save} onChange={() => setDirty(true)} className="mt-4 space-y-4">
            <p className="text-xs leading-relaxed text-[var(--muted)]">{uk
              ? "Створіть ключ читання замовлень на рівні бази та окремий ключ читання надходжень на рівні акаунту. Увімкніть YML-експорт. Ключі та посилання не відображаються після збереження. Для заміни введіть їх знову; порожні необов’язкові поля вимикають відповідний доступ."
              : "Create an orders read key at form level and a receipts read key at account level. Enable YML export. Saved keys and the feed link are never displayed. Re-enter them to replace the configuration; blank optional fields disable that access."}</p>
            <fieldset disabled={busy !== null} className="space-y-4">
              <div><label htmlFor="salesdrive-host" className="text-sm text-[var(--text)]">{uk ? "Домен акаунту" : "Account hostname"}</label>
                <input id="salesdrive-host" name="accountHost" defaultValue={connection.accountHost ?? ""} required maxLength={100} autoComplete="off" spellCheck={false} placeholder="example.salesdrive.me…" className={fieldClass} /></div>
              <div><label htmlFor="salesdrive-orders-key" className="text-sm text-[var(--text)]">{uk ? "Ключ читання замовлень" : "Orders read key"}</label>
                <input id="salesdrive-orders-key" type="password" name="ordersApiKey" required maxLength={512} autoComplete="off" spellCheck={false} className={fieldClass} /></div>
              <div><label htmlFor="salesdrive-receipts-key" className="text-sm text-[var(--text)]">{uk ? "Ключ читання надходжень (необов’язково)" : "Receipts read key (optional)"}</label>
                <input id="salesdrive-receipts-key" type="password" name="receiptsApiKey" maxLength={512} autoComplete="off" spellCheck={false} className={fieldClass} /></div>
              <div><label htmlFor="salesdrive-yml" className="text-sm text-[var(--text)]">{uk ? "YML-посилання з токеном (необов’язково)" : "YML link with token (optional)"}</label>
                <input id="salesdrive-yml" type="password" name="ymlUrl" maxLength={2048} autoComplete="off" spellCheck={false} className={fieldClass} /></div>
              <button type="submit" className={buttonClass}>{busy === "save" ? uk ? "Зберігаємо…" : "Saving…" : uk ? "Зберегти з’єднання" : "Save connection"}</button>
            </fieldset>
          </form>
        </details> : <p className="text-xs text-[var(--muted)]">{uk ? "Змінити або перевірити з’єднання може адміністратор." : "An administrator can configure or check the connection."}</p>}
      </div>
    </section>
  );
}
