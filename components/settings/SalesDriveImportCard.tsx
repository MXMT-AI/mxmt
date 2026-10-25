"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/fetch";
import { readApiJson } from "@/lib/api-response";

interface Progress { id: string; state: string; mode: string; stats: Record<string, number>; issues: string[]; errorCode: string | null; availableAt: string; updatedAt: string }
interface ImportResponse extends Record<string, unknown> {
  job?: Progress | null;
  coverage?: { firstObservedAt: string | null; observedDays: number; missingDays?: number };
  resources?: Array<{resource:string;lastSuccess:string|null;lagSeconds:number|null;pending:number;errorCode:string|null}>;
  calculation?: {state:string}|null;
  backfill?: {id:string;state:string;stats:{pages?:number;orders?:number}}|null;
  lastTickAt?: string|null;
  code?: string; error?: string;
}
/** Poll jobs that are queued, leased or waiting for an automatic retry. */
const running = (job: Progress | null) => Boolean(job && ["PENDING", "RUNNING", "RETRY"].includes(job.state));
/** Share import progress and recovery controls across order and inventory resources. */
export default function SalesDriveImportCard({ lang, canManage, resource = "orders" }: { lang: "uk" | "en"; canManage: boolean; resource?: "orders" | "inventory" | "sync" }) {
  const uk = lang === "uk";
  const inventory = resource === "inventory", sync = resource === "sync";
  const endpoint = sync ? "/api/connectors/salesdrive/sync" : inventory ? "/api/connectors/salesdrive/inventory" : "/api/connectors/salesdrive/import";
  const headingId = `salesdrive-${resource}-import-title`;
  const [syncInfo, setSyncInfo] = useState<ImportResponse>({});
  const [coverage, setCoverage] = useState<{ firstObservedAt: string | null; observedDays: number; missingDays?: number } | null>(null);
  const [job, setJob] = useState<Progress | null>(null), [loaded, setLoaded] = useState(false);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  useEffect(() => { if (error) errorRef.current?.focus(); }, [error]);
  const applyProgress = useCallback((result: ImportResponse) => {
    setError(""); setJob(result.job ?? null); setSyncInfo(result); setCoverage(result.coverage ?? null); setLoaded(true);
  }, []);
  const load = useCallback(async (signal?: AbortSignal) => {
    const response = await apiFetch(endpoint, { signal, cache: "no-store" });
    const result = await readApiJson<ImportResponse>(response);
    if (!response.ok || result.job === undefined) throw new Error("IMPORT_UNAVAILABLE");
    applyProgress(result);
  }, [endpoint, applyProgress]);
  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal).catch(() => { if (!controller.signal.aborted) { setError(uk ? "Не вдалося завантажити прогрес." : "Could not load import progress."); setLoaded(true); } });
    return () => controller.abort();
  }, [load, uk]);
  const polling = running(job) || sync && Boolean(syncInfo.resources?.some((r)=>r.pending>0));
  const calculating = sync && ['WAITING_ENGINE','PENDING','RUNNING','FAILED'].includes(syncInfo.calculation?.state ?? '');
  const watching = polling || calculating;
  useEffect(() => {
    if (!watching) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try { await load(controller.signal); }
      catch { if (!controller.signal.aborted) setError(uk ? "Не вдалося оновити прогрес. Наступна спроба — автоматично." : "Could not refresh progress. Retrying automatically."); }
      finally { if (!controller.signal.aborted) timer = setTimeout(poll, 10_000); }
    };
    timer = setTimeout(poll, 10_000);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [watching, load, uk]);
  async function act(action: string) {
    setBusy(true); setError("");
    try {
      const response = await apiFetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
      const result = await readApiJson<ImportResponse>(response);
      if (!response.ok || result.job === undefined) throw new Error(result.code === "IMPORT_BUSY" ? "IMPORT_BUSY" : result.code === "CATALOG_NOT_CONFIGURED" ? "CATALOG_NOT_CONFIGURED" : "IMPORT_UNAVAILABLE");
      applyProgress(result);
    } catch (error) { setError(error instanceof Error && error.message === "IMPORT_BUSY" ? (uk ? "Завершіть або відновіть інший імпорт SalesDrive перед запуском цього." : "Finish or resume the other SalesDrive import before starting this one.") : error instanceof Error && error.message === "CATALOG_NOT_CONFIGURED" ? (uk ? "Збережіть YML-посилання в налаштуваннях SalesDrive перед імпортом каталогу." : "Save a YML feed URL in SalesDrive settings before importing the catalogue.") : uk ? "Не вдалося виконати дію. Перевірте з’єднання та налаштування джерела." : "Import action failed. Check the connection and source settings."); }
    finally { setBusy(false); }
  }
  const labels: Record<string, string> = uk ? { PENDING: "У черзі", RUNNING: "Імпортується", RETRY: "Очікує повтору", PAUSED: "Призупинено", FAILED: "Помилка", COMPLETE: "Завершено" }
    : { PENDING: "Queued", RUNNING: "Importing", RETRY: "Waiting to retry", PAUSED: "Paused", FAILED: "Failed", COMPLETE: "Complete" };
  const button = "touch-manipulation focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--text)] rounded-lg border border-[var(--border)] px-3 py-2 text-sm text-[var(--text)] disabled:opacity-50 disabled:cursor-not-allowed hover:bg-[var(--bg)]";
  return <section className="mb-10 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5" aria-labelledby={headingId} aria-busy={busy}>
    <h2 id={headingId} className="font-semibold text-[var(--text)]">{sync ? (uk ? "Синхронізація SalesDrive" : "SalesDrive synchronization") : inventory ? (uk ? "Каталог і залишки SalesDrive" : "SalesDrive catalogue and stock") : (uk ? "Історія замовлень SalesDrive" : "SalesDrive order history")}</h2>
    <p className="mt-1 text-sm text-[var(--muted)]">{sync ? (uk ? "Замовлення — кожні дві години. Залишки — о 03:00 за Києвом. Автоматичні оновлення потребують підключеного зовнішнього планувальника." : "Orders every two hours; stock at 03:00 Kyiv. Automatic updates require a connected external scheduler.") : inventory ? (uk ? "Надходження, каталог і поточні залишки. Історія залишків починається з першого спостереження." : "Receipts, catalogue and current stock. Stock history starts with the first observation.") : (uk ? "Історія за два роки, потім — оновлені замовлення. Імпорт зберігає прогрес між запусками." : "Two years of history, then updated orders. Progress is saved between runs.")}</p>
    <p className="mt-3 text-sm text-[var(--text)]" role="status">{!loaded ? (uk ? "Завантаження…" : "Loading…") : job ? labels[job.state] ?? job.state : (uk ? "Імпорт ще не запускався." : "No import has been started.")}</p>
    {job && <>
      {!sync && <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        {(inventory ? [[uk ? "Надходження" : "Receipts", job.stats.receipts], [uk ? "Товари" : "Products", job.stats.products], [uk ? "Знімки" : "Snapshots", job.stats.snapshots], [uk ? "Зміни цін" : "Price changes", job.stats.prices]] : [[uk ? "Сторінки" : "Pages", job.stats.pages], [uk ? "Замовлення" : "Orders", job.stats.orders], [uk ? "Оновлено" : "Imported", job.stats.imported], [uk ? "Дублікати" : "Duplicates", job.stats.duplicate], [uk ? "Застарілі" : "Stale", job.stats.stale], [uk ? "Потребують перевірки" : "Quarantined", job.stats.quarantined]]).map(([label, count]) => <div key={label}><dt className="text-[var(--muted)]">{label}</dt><dd className="tabular-nums text-[var(--text)]">{typeof count === "number" ? count.toLocaleString(uk ? "uk-UA" : "en-GB") : count}</dd></div>)}
      </dl>}
      {job.stats.warnings > 0 && <p className="mt-3 text-sm text-[var(--text)]">{uk ? "Є попередження якості даних. Перевірте ці попередження перед використанням у звітах." : "Data quality warnings exist. Review these warnings before using records in reports."}</p>}
      {job.issues?.length > 0 && <details className="mt-3 text-sm text-[var(--text)]"><summary className="cursor-pointer">{uk ? "Попередження якості даних" : "Data quality warnings"}</summary><ul className="mt-2 list-disc space-y-1 pl-5">{job.issues.map((code) => <li key={code} className="break-words">{issueLabel(code, uk)}</li>)}</ul></details>}
      {job.errorCode && <p className="mt-3 break-words text-sm text-[var(--text)]">{uk ? "Причина" : "Reason"}: {errorLabel(job.errorCode, uk)}</p>}
      {job.state === "RETRY" && <p className="mt-2 text-sm text-[var(--muted)]">{uk ? "Наступна спроба не раніше" : "Next attempt after"}: {new Date(job.availableAt).toLocaleString(uk ? "uk-UA" : "en-GB")}</p>}
    </>}
    {sync && <>
      {job && <p className="mt-2 break-all text-sm text-[var(--muted)]">{uk ? "Цикл" : "Cycle"}: {job.id}</p>}
      {job?.state==='COMPLETE' && <p className="mt-2 text-sm text-[var(--muted)]">{uk?'Завершено':'Completed'}: {new Date(job.updatedAt).toLocaleString(uk?'uk-UA':'en-GB')}</p>}
      <p className="mt-2 text-sm text-[var(--muted)]">{uk?'Останній виклик планувальника':'Last scheduler tick'}: {syncInfo.lastTickAt?new Date(syncInfo.lastTickAt).toLocaleString(uk?'uk-UA':'en-GB'):(uk?'ще немає — підключіть зовнішній планувальник':'none yet — connect an external scheduler')}</p>
      {syncInfo.backfill && <p className="mt-2 text-sm text-[var(--muted)]">{uk?'Історичний імпорт':'Historical import'}: {labels[syncInfo.backfill.state]??syncInfo.backfill.state}; {uk?'сторінок':'pages'} {syncInfo.backfill.stats.pages??0}; {uk?'замовлень':'orders'} {syncInfo.backfill.stats.orders??0}.</p>}
      {syncInfo.resources?.map((r)=><p key={r.resource} className="mt-3 text-sm text-[var(--muted)]">{r.resource==='orders' ? (uk?'Замовлення':'Orders') : (uk?'Залишки':'Stock')}: {uk?'останнє завершення':'last completion'} {r.lastSuccess?new Date(r.lastSuccess).toLocaleString(uk?'uk-UA':'en-GB'):(uk?'ще немає':'none yet')}; {uk?'у черзі':'pending'} {r.pending.toLocaleString(uk?'uk-UA':'en-GB')}. {r.lagSeconds!==null && `${uk?'Відставання (хв)':'Lag (min)'}: ${Math.ceil(r.lagSeconds/60).toLocaleString(uk?'uk-UA':'en-GB')}.`} {r.errorCode && errorLabel(r.errorCode,uk)}</p>)}
      <div role="status" aria-live="polite">
        {['WAITING_ENGINE','PENDING','RUNNING'].includes(syncInfo.calculation?.state ?? '') && <p className="mt-3 text-sm text-[var(--muted)]">{uk?'Дані імпортовано. Оновлюємо показники продажів і запасів…':'Inputs imported. Updating sales and stock metrics…'}</p>}
        {syncInfo.calculation?.state==='FAILED' && <p className="mt-3 text-sm text-[var(--muted)]">{uk?'Не вдалося оновити показники. Повторимо спробу автоматично.':'Could not update metrics. We will retry automatically.'}</p>}
      </div>
      {sync && job?.state==='PAUSED' && <p className="mt-3 text-sm text-[var(--muted)]">{uk?'Відновіть цикл після виправлення з’єднання або налаштувань.':'Resume this cycle after correcting the connection or source settings.'}</p>}
    </>}
    {inventory && coverage && <p className="mt-3 text-sm text-[var(--muted)]">{coverage.firstObservedAt
      ? `${uk ? "Перше спостереження" : "First observation"}: ${new Date(coverage.firstObservedAt).toLocaleString(uk ? "uk-UA" : "en-GB")}. ${uk ? "Днів зі знімками" : "Days with snapshots"}: ${coverage.observedDays}. ${uk ? "Пропущених днів" : "Missing days"}: ${coverage.missingDays ?? 0}. ${uk ? "Раніша історія недоступна." : "Earlier history is unavailable."}`
      : (uk ? "Історії залишків ще немає. Перший успішний імпорт створить поточний знімок." : "No stock history yet. The first successful import creates a current snapshot.")}</p>}
    {error && <p ref={errorRef} tabIndex={-1} className="mt-3 text-sm text-red-500" role="alert">{error}</p>}
    <div className="mt-4 flex flex-wrap gap-2">
      {canManage && <>
        <button className={button} disabled={!loaded || busy || running(job) || job?.state === "PAUSED" || job?.state === "FAILED"} onClick={() => act(sync ? "refresh" : inventory ? "start" : "backfill")}>{sync ? (uk ? "Оновити дані" : "Refresh data") : inventory ? (uk ? "Оновити каталог і залишки" : "Refresh catalogue and stock") : (uk ? "Імпортувати два роки" : "Import two years")}</button>
        {!inventory && !sync && <button className={button} disabled={!loaded || busy || !job || job.state !== "COMPLETE"} onClick={() => act("incremental")}>{uk ? "Імпортувати зміни" : "Import changes"}</button>}
        {job && ["PAUSED", "FAILED"].includes(job.state) && <button className={button} disabled={busy} onClick={() => act("resume")}>{uk ? "Відновити" : "Resume"}</button>}
        {sync && syncInfo.backfill && ["PAUSED","FAILED"].includes(syncInfo.backfill.state) && <button className={button} disabled={busy} onClick={()=>act("resumeBackfill")}>{uk?"Відновити історичний імпорт":"Resume historical import"}</button>}
        {polling && <button className={button} disabled={busy || !sync && job?.state === "RUNNING"} onClick={() => act("step")}>{uk ? "Обробити наступну сторінку" : "Process next page"}</button>}
      </>}
      <button className={button} disabled={busy} onClick={() => { setError(""); load().catch(() => setError(uk ? "Не вдалося оновити прогрес." : "Could not refresh progress.")); }}>{uk ? "Оновити прогрес" : "Refresh progress"}</button>
    </div>
  </section>;
}

/** Explain sanitized data-quality codes without displaying private source payloads. */
function issueLabel(code: string, uk: boolean) {
  const labels: Record<string, [string, string]> = {
    NEGATIVE_SOURCE_STOCK: ["Negative source stock is retained as a data-quality exception; inventory values are unavailable.", "Від’ємний залишок збережено як помилку якості даних; вартість залишку недоступна."],
    NEGATIVE_MOVEMENT_QUANTITY: ["A movement has a negative quantity; it does not establish a purchase cohort or cost.", "Рух має від’ємну кількість; він не визначає когорту закупівлі чи собівартість."],
    STALE_CATALOG_OBSERVATION: ["An older feed observation was skipped; newer catalogue data is retained.", "Старіше спостереження пропущено; новіші дані каталогу збережено."],
    HISTORICAL_STOCK_UNAVAILABLE: ["Earlier stock cannot be reconstructed from a current feed. Only recorded observations are available.", "З поточного файлу неможливо відновити минулі залишки. Доступні лише зафіксовані спостереження."],
    RECEIPT_POSTING_UNVERIFIED: ["Verify receipt posting statuses and supplier mapping before using purchase cost.", "Перевірте статуси проведення й відповідність постачальників перед використанням закупівельної ціни."],
    RECEIPT_DATE_UNAVAILABLE: ["Some receipt dates are missing or invalid.", "Деякі дати надходжень відсутні або некоректні."],
    INVALID_RECEIPT_LINE: ["Some receipts have invalid quantities or costs and were skipped. Correct them in SalesDrive and import again.", "Деякі надходження містять некоректні кількості або собівартість і пропущені. Виправте їх у SalesDrive й повторіть імпорт."],
    RECEIPTS_NOT_CONFIGURED: ["A receipts read key is not configured. Purchase cost coverage is incomplete.", "Ключ читання надходжень не налаштовано. Покриття закупівельної собівартості неповне."],
    DERIVED_RECEIPT_LINE_IDENTITY: ["Receipt line identity is derived; current document lines are replaced together.", "ID рядків надходжень похідні; поточні рядки документа оновлюються разом."],
    RECEIPT_VERSION_CONFLICT: ["Conflicting receipt versions were retained for review.", "Суперечливі версії надходження збережено для перевірки."],
    STOCK_QUANTITY_UNAVAILABLE: ["Some stock quantities are unknown; they are not treated as zero.", "Деякі залишки невідомі; вони не прирівнюються до нуля."],
    RETAIL_PRICE_UNAVAILABLE: ["Some retail prices are unavailable.", "Деякі роздрібні ціни недоступні."],
    CURRENCY_UNVERIFIED: ["Verify the feed currency before combining monetary values.", "Перевірте валюту файлу перед об’єднанням грошових значень."],
    MISSING_SOURCE_SKU: ["Some products have no article; their source ID is retained as a derived catalogue identity.", "Деякі товари не мають артикула; ID джерела збережено як похідний ідентифікатор каталогу."],
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

/** Translate recoverable import failures into a concrete next action. */
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
