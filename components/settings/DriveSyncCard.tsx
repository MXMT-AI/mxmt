"use client";

import { useState } from "react";
import { RefreshCw, CheckCircle2, AlertCircle, Clock, ShieldCheck, AlertTriangle } from "lucide-react";
import { apiFetch } from "@/lib/fetch";

interface DriveSync {
  syncStatus: string;
  lastSyncAt: Date | null;
  errorMessage: string | null;
  driveFileId: string;
}

type DriveMode = "service_account" | "public_link" | "none";

export default function DriveSyncCard({
  lastSync,
  lang,
  driveMode,
}: {
  lastSync: DriveSync | null;
  lang: "uk" | "en";
  driveMode: DriveMode;
}) {
  const [syncing, setSyncing] = useState(false);
  const [result, setResult] = useState<"ok" | "warn" | "error" | null>(null);
  const [errMsg, setErrMsg] = useState("");
  const [importResult, setImportResult] = useState<{ skus: number; inventory: number; sales: number; sheets: { name: string; imported: string; skipped: string }[] } | null>(null);
  const uk = lang === "uk";

  async function triggerSync() {
    setSyncing(true);
    setResult(null);
    setImportResult(null);
    try {
      const res = await apiFetch("/api/sync/drive", { method: "POST" });
      const d = await res.json();
      if (!res.ok) {
        setErrMsg(d.error ?? "Unknown error");
        setResult("error");
        return;
      }
      setImportResult({ skus: d.skus ?? 0, inventory: d.inventory ?? 0, sales: d.sales ?? 0, sheets: d.sheets ?? [] });
      if (d.warning) {
        setErrMsg(d.warning);
        setResult("warn");
      } else {
        setResult("ok");
      }
    } catch {
      setResult("error");
      setErrMsg(uk ? "Помилка мережі" : "Network error");
    } finally {
      setSyncing(false);
    }
  }

  const visibleStatus = syncing
    ? "running"
    : result === "error" || result === "warn"
      ? "error"
      : result === "ok"
        ? "success"
        : lastSync?.syncStatus ?? "pending";

  const statusIcon = () => {
    if (visibleStatus === "pending") return <Clock size={14} className="text-[var(--subtle)]" />;
    if (visibleStatus === "success") return <CheckCircle2 size={14} className="text-[#86efac]" />;
    if (visibleStatus === "error") return <AlertCircle size={14} className="text-[#fca5a5]" />;
    return <RefreshCw size={14} className="text-[#fbbf24] animate-spin" />;
  };

  return (
    <div className="space-y-3">

      {/* Mode indicator */}
      {driveMode === "service_account" && (
        <div className="flex items-start gap-3 bg-[#86efac]/8 border border-[#86efac]/20 rounded-xl p-4">
          <ShieldCheck size={15} className="text-[#86efac] mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm font-medium text-[#86efac]">
              {uk ? "Service Account (рекомендовано)" : "Service Account (recommended)"}
            </p>
            <p className="text-xs text-[var(--muted)] mt-0.5">
              {uk
                ? "Приватний доступ через ключ сервісного акаунту. Файл може залишатись закритим. Доступ лише на читання — файл у Drive не змінюється."
                : "Private access via service account key. File can stay private. Read-only — the Drive file is never modified."}
            </p>
            <p className="text-[11px] font-mono text-[var(--subtle)] mt-1">
              GOOGLE_DRIVE_FILE_ID + GOOGLE_SERVICE_ACCOUNT_KEY
            </p>
          </div>
        </div>
      )}

      {driveMode === "public_link" && (
        <div className="flex items-start gap-3 bg-[#fbbf24]/8 border border-[#fbbf24]/30 rounded-xl p-4">
          <AlertTriangle size={15} className="text-[#fbbf24] mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm font-medium text-[#fbbf24]">
              {uk ? "Публічне посилання (не рекомендується)" : "Public link (not recommended)"}
            </p>
            <p className="text-xs text-[var(--muted)] mt-0.5">
              {uk
                ? "Файл має бути відкритий для всіх за посиланням. Дані доступні будь-кому з посиланням. Доступ лише на читання — файл у Drive не змінюється."
                : "The file must be shared with anyone who has the link. Data is accessible to anyone with the link. Read-only — the Drive file is never modified."}
            </p>
            <p className="text-[11px] font-mono text-[var(--subtle)] mt-1">
              {uk ? "Тільки GOOGLE_DRIVE_FILE_ID (без SERVICE_ACCOUNT_KEY)" : "Only GOOGLE_DRIVE_FILE_ID (no SERVICE_ACCOUNT_KEY)"}
            </p>
          </div>
        </div>
      )}

      {driveMode === "none" && (
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4">
          <p className="text-sm font-medium text-[var(--muted)] mb-3">
            {uk ? "Не налаштовано" : "Not configured"}
          </p>
          <div className="text-xs bg-[#fbbf24]/5 border border-[#fbbf24]/20 rounded-lg p-3 space-y-2">
            <p className="font-semibold text-[#fbbf24]">
              {uk ? "Варіант 1 — Service Account (рекомендовано)" : "Option 1 — Service Account (recommended)"}
            </p>
            <p className="font-mono text-[var(--muted)]">GOOGLE_DRIVE_FILE_ID=&lt;id&gt;</p>
            <p className="font-mono text-[var(--muted)]">GOOGLE_SERVICE_ACCOUNT_KEY=&lt;base64&gt;</p>
            <div className="border-t border-[var(--border-faint)] pt-2 mt-2">
              <p className="font-semibold text-[#fbbf24]">
                {uk ? "Варіант 2 — Публічне посилання (не рекомендується)" : "Option 2 — Public link (not recommended)"}
              </p>
              <p className="font-mono text-[var(--muted)] mt-1">GOOGLE_DRIVE_FILE_ID=&lt;id&gt;</p>
              <p className="text-[var(--subtle)] mt-1">
                {uk
                  ? "Файл: Поділитися → «Всі, хто має посилання — Переглядач»"
                  : "File: Share → \"Anyone with the link — Viewer\""}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Sync status + button */}
      {driveMode !== "none" && (
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                {statusIcon()}
                <span className="text-sm text-[var(--text)] font-medium">
                  {visibleStatus === "pending"
                    ? (uk ? "Не синхронізовано" : "Not synced")
                    : visibleStatus === "success"
                    ? (uk ? "Синхронізовано успішно" : "Synced successfully")
                    : visibleStatus === "error"
                    ? (uk ? "Помилка синхронізації" : "Sync failed")
                    : (uk ? "Синхронізація…" : "Syncing…")}
                </span>
              </div>
              {lastSync?.lastSyncAt && (
                <p className="text-xs text-[var(--muted)]">
                  {uk ? "Останній синк:" : "Last sync:"}{" "}
                  {new Date(lastSync.lastSyncAt).toLocaleString(uk ? "uk-UA" : "en-GB")}
                </p>
              )}
              {result === null && lastSync?.errorMessage && (
                <p className="text-xs text-[#fca5a5] mt-1 font-mono">{lastSync.errorMessage}</p>
              )}
              {result === "ok" && importResult && (
                <div className="mt-2 text-xs">
                  <p className="text-[#86efac] font-medium mb-1">
                    ✓ {uk ? "Синхронізовано успішно" : "Sync complete"}
                  </p>
                  <p className="text-[var(--muted)] font-mono">
                    SKU: {importResult.skus} · {uk ? "Залишки" : "Stock"}: {importResult.inventory} · {uk ? "Продажі" : "Sales"}: {importResult.sales}
                  </p>
                  {importResult.sheets.length > 0 && (
                    <div className="mt-1 space-y-0.5">
                      {importResult.sheets.map((s, i) => (
                        <p key={i} className="text-[#484f58] font-mono text-[10px]">
                          {s.skipped
                            ? `⚠ «${s.name}»: ${s.skipped}`
                            : `✓ «${s.name}»: ${s.imported}`}
                        </p>
                      ))}
                    </div>
                  )}
                  <p className="text-[var(--subtle)] mt-1">{uk ? "Оновіть сторінку щоб побачити дані." : "Refresh the page to see data."}</p>
                </div>
              )}
              {result === "warn" && (
                <div className="mt-2 text-xs">
                  <p className="text-[#fbbf24] font-medium mb-1">⚠ {uk ? "Імпортовано 0 записів" : "0 records imported"}</p>
                  <p className="text-[var(--muted)] whitespace-pre-wrap">{errMsg}</p>
                </div>
              )}
              {result === "error" && (
                <p className="text-[#fca5a5] text-xs mt-2 whitespace-pre-wrap">{errMsg}</p>
              )}
            </div>

            <button
              onClick={triggerSync}
              disabled={syncing}
              className="flex items-center gap-2 px-4 py-2 bg-[var(--input-bg)] border border-[var(--border)] text-[var(--text)] text-sm rounded-lg hover:bg-[var(--input-hover)] transition-colors disabled:opacity-50 flex-shrink-0"
            >
              <RefreshCw size={13} className={syncing ? "animate-spin" : ""} />
              {syncing ? (uk ? "Синкаємо…" : "Syncing…") : (uk ? "Синхронізувати" : "Sync now")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
