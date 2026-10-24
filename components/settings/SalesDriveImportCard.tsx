"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/fetch";
import { readApiJson } from "@/lib/api-response";

interface Progress { id: string; state: string; mode: string; stats: { pages: number; orders: number; imported: number; duplicate: number; stale: number; quarantined: number; warnings: number }; issues: string[]; errorCode: string | null; availableAt: string; updatedAt: string }
const endpoint = "/api/connectors/salesdrive/import";
const running = (job: Progress | null) => Boolean(job && ["PENDING", "RUNNING", "RETRY"].includes(job.state));
export default function SalesDriveImportCard({ lang, canManage }: { lang: "uk" | "en"; canManage: boolean }) {
  const uk = lang === "uk";
  const [job, setJob] = useState<Progress | null>(null), [loaded, setLoaded] = useState(false);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  useEffect(() => { if (error) errorRef.current?.focus(); }, [error]);
  const load = useCallback(async (signal?: AbortSignal) => {
    const response = await apiFetch(endpoint, { signal, cache: "no-store" });
    const result = await readApiJson<{ job?: Progress | null; error?: string }>(response);
    if (!response.ok || result.job === undefined) throw new Error("IMPORT_UNAVAILABLE");
    setError(""); setJob(result.job); setLoaded(true);
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal).catch(() => { if (!controller.signal.aborted) { setError(uk ? "Не вдалося завантажити прогрес." : "Could not load import progress."); setLoaded(true); } });
    return () => controller.abort();
  }, [load, uk]);
  useEffect(() => {
    if (!running(job)) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try { await load(controller.signal); }
      catch { if (!controller.signal.aborted) setError(uk ? "Не вдалося оновити прогрес. Наступна спроба — автоматично." : "Could not refresh progress. Retrying automatically."); }
      finally { if (!controller.signal.aborted) timer = setTimeout(poll, 10_000); }
    };
    timer = setTimeout(poll, 10_000);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [job?.state, load, uk]);
  async function act(action: string) {
    setBusy(true); setError("");
    try {
      const response = await apiFetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
      const result = await readApiJson<{ job?: Progress | null; error?: string }>(response);
      if (!response.ok || result.job === undefined) throw new Error("IMPORT_UNAVAILABLE");
      setJob(result.job); setLoaded(true);
    } catch { setError(uk ? "Не вдалося виконати дію. Перевірте з’єднання та налаштування джерела." : "Import action failed. Check the connection and source settings."); }
    finally { setBusy(false); }
  }
  const labels: Record<string, string> = uk ? { PENDING: "У черзі", RUNNING: "Імпортується", RETRY: "Очікує повтору", PAUSED: "Призупинено", FAILED: "Помилка", COMPLETE: "Завершено" }
    : { PENDING: "Queued", RUNNING: "Importing", RETRY: "Waiting to retry", PAUSED: "Paused", FAILED: "Failed", COMPLETE: "Complete" };
  const button = "touch-manipulation focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--text)] rounded-lg border border-[var(--border)] px-3 py-2 text-sm text-[var(--text)] disabled:opacity-50 disabled:cursor-not-allowed hover:bg-[var(--bg)]";
  return <section className="mb-10 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5" aria-labelledby="salesdrive-import-title" aria-busy={busy}>
    <h2 id="salesdrive-import-title" className="font-semibold text-[var(--text)]">{uk ? "Історія замовлень SalesDrive" : "SalesDrive order history"}</h2>
    <p className="mt-1 text-sm text-[var(--muted)]">{uk ? "Історія за два роки, потім — оновлені замовлення. Імпорт зберігає прогрес між запусками." : "Two years of history, then updated orders. Progress is saved between runs."}</p>
    <p className="mt-3 text-sm text-[var(--text)]" role="status">{!loaded ? (uk ? "Завантаження…" : "Loading…") : job ? labels[job.state] ?? job.state : (uk ? "Імпорт ще не запускався." : "No import has been started.")}</p>
    {job && <>
      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        {[[uk ? "Сторінки" : "Pages", job.stats.pages], [uk ? "Замовлення" : "Orders", job.stats.orders], [uk ? "Оновлено" : "Imported", job.stats.imported], [uk ? "Дублікати" : "Duplicates", job.stats.duplicate], [uk ? "Застарілі" : "Stale", job.stats.stale], [uk ? "Потребують перевірки" : "Quarantined", job.stats.quarantined]].map(([label, count]) => <div key={label}><dt className="text-[var(--muted)]">{label}</dt><dd className="tabular-nums text-[var(--text)]">{typeof count === "number" ? count.toLocaleString(uk ? "uk-UA" : "en-GB") : count}</dd></div>)}
      </dl>
      {job.stats.warnings > 0 && <p className="mt-3 text-sm text-[var(--text)]">{uk ? "Є попередження якості даних. Перевірте ці попередження перед використанням у звітах." : "Data quality warnings exist. Review these warnings before using records in reports."}</p>}
      {job.issues?.length > 0 && <details className="mt-3 text-sm text-[var(--text)]"><summary className="cursor-pointer">{uk ? "Попередження якості даних" : "Data quality warnings"}</summary><ul className="mt-2 list-disc space-y-1 pl-5">{job.issues.map((code) => <li key={code} className="break-words">{issueLabel(code, uk)}</li>)}</ul></details>}
      {job.errorCode && <p className="mt-3 break-words text-sm text-[var(--text)]">{uk ? "Причина" : "Reason"}: {errorLabel(job.errorCode, uk)}</p>}
      {job.state === "RETRY" && <p className="mt-2 text-sm text-[var(--muted)]">{uk ? "Наступна спроба не раніше" : "Next attempt after"}: {new Date(job.availableAt).toLocaleString(uk ? "uk-UA" : "en-GB")}</p>}
    </>}
    {error && <p ref={errorRef} tabIndex={-1} className="mt-3 text-sm text-red-500" role="alert">{error}</p>}
    <div className="mt-4 flex flex-wrap gap-2">
      {canManage && <>
        <button className={button} disabled={!loaded || busy || running(job) || job?.state === "PAUSED"} onClick={() => act("backfill")}>{uk ? "Імпортувати два роки" : "Import two years"}</button>
        <button className={button} disabled={!loaded || busy || !job || job.state !== "COMPLETE"} onClick={() => act("incremental")}>{uk ? "Імпортувати зміни" : "Import changes"}</button>
        {job && ["PAUSED", "FAILED"].includes(job.state) && <button className={button} disabled={busy} onClick={() => act("resume")}>{uk ? "Відновити" : "Resume"}</button>}
        {running(job) && <button className={button} disabled={busy || job?.state === "RUNNING"} onClick={() => act("step")}>{uk ? "Обробити наступну сторінку" : "Process next page"}</button>}
      </>}
      <button className={button} disabled={busy} onClick={() => { setError(""); load().catch(() => setError(uk ? "Не вдалося оновити прогрес." : "Could not refresh progress.")); }}>{uk ? "Оновити прогрес" : "Refresh progress"}</button>
    </div>
  </section>;
}

function issueLabel(code: string, uk: boolean) {
  const labels: Record<string, [string, string]> = {
    STATUS_MAPPING_UNVERIFIED: ["Verify which source statuses count as sales and returns.", "Перевірте відповідність статусів продажам і поверненням."],
    CHANNEL_MAPPING_UNVERIFIED: ["Verify source channel IDs and names.", "Перевірте ідентифікатори та назви каналів."],
    CHANNEL_METADATA_UNVERIFIED: ["Channel metadata needs account verification.", "Довідник каналів потребує перевірки для цього акаунта."],
    DERIVED_LINE_IDENTITY: ["The source has no stable line IDs; current order lines are replaced together.", "Джерело не надає стабільних ID рядків; поточні рядки замовлення оновлюються разом."],
    REVENUE_MAPPING_UNVERIFIED: ["Revenue is unavailable until price and discount rules are verified.", "Виручка недоступна, доки не перевірено правила ціни та знижок."],
    COST_UNVERIFIED: ["Cost is unavailable or its mapping is unverified.", "Собівартість недоступна або її відповідність не перевірена."],
    RETURN_DATE_UNAVAILABLE: ["The source does not supply the return date.", "Джерело не надає дату повернення."],
    PAYMENT_DATE_UNAVAILABLE: ["A paid order has no usable payment date.", "Оплачене замовлення не має коректної дати оплати."],
    PAYMENT_DATE_PRECISION: ["Payment dates have day precision; an exact time is unavailable.", "Дата оплати має точність до дня; точний час невідомий."],
    INVALID_SOURCE_DATE: ["A source date is invalid or ambiguous in its timezone.", "Дата джерела некоректна або неоднозначна в його часовому поясі."],
    SKU_ALIAS_UNRESOLVED: ["Some products are not linked to the tenant catalogue yet.", "Деякі товари ще не пов’язані з каталогом компанії."],
    SKU_ALIAS_CONFLICT: ["Product identifiers point to different catalogue items.", "Ідентифікатори товару вказують на різні позиції каталогу."],
    SOURCE_PAGINATION_NOT_SNAPSHOT: ["SalesDrive pages are not a frozen snapshot. Reconcile against the account before activation.", "Сторінки SalesDrive не є незмінним знімком. Звірте дані з акаунтом перед активацією."],
    ORDER_VERSION_CONFLICT: ["Conflicting order versions were retained for review.", "Суперечливі версії замовлення збережено для перевірки."],
    INVALID_QUANTITY: ["Some quantities are invalid; affected orders need review.", "Деякі кількості некоректні; відповідні замовлення потребують перевірки."],
    DUPLICATE_SOURCE_LINE_ID: ["An order contains duplicate source line IDs.", "Замовлення містить повторені ID рядків джерела."],
    AMOUNT_OVERFLOW: ["An amount exceeds supported precision.", "Сума перевищує підтримувану точність."],
  };
  return labels[code]?.[uk ? 1 : 0] ?? (uk ? "Дані потребують перевірки." : "Source data needs review.");
}

function errorLabel(code: string, uk: boolean) {
  const labels: Record<string, [string, string]> = {
    RATE_LIMITED: ["The account request limit was reached. The import will retry automatically.", "Досягнуто ліміту запитів акаунта. Імпорт повториться автоматично."],
    AUTH_FAILED: ["Check the saved SalesDrive read key, then resume.", "Перевірте збережений ключ читання SalesDrive, потім відновіть імпорт."],
    NOT_CONFIGURED: ["Save a SalesDrive connection, then resume.", "Збережіть з’єднання SalesDrive, потім відновіть імпорт."],
    CONNECTOR_CONFIG_CHANGED: ["The connection changed. Check it, then resume.", "З’єднання змінилося. Перевірте його, потім відновіть імпорт."],
    TIMEOUT: ["SalesDrive did not respond in time. The import will retry.", "SalesDrive не відповів вчасно. Імпорт повториться."],
    NETWORK_ERROR: ["SalesDrive is temporarily unavailable. The import will retry.", "SalesDrive тимчасово недоступний. Імпорт повториться."],
    INVALID_RESPONSE: ["SalesDrive returned an unexpected response. Check the account before resuming.", "SalesDrive повернув неочікувану відповідь. Перевірте акаунт перед відновленням."],
  };
  return labels[code]?.[uk ? 1 : 0] ?? (uk ? "Імпорт не завершено. Перевірте з’єднання та відновіть його." : "The import could not finish. Check the connection and resume.");
}
