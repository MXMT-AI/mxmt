"use client";

import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button/button";
import { Note } from "@/components/ui/note/note";
import { panel } from "@/components/ui/panel/panel-styles";
import { cn } from "@/lib/utils";
import { driveAccessModes } from "./drive-access-modes";
import { driveSyncStatus } from "./drive-sync-status";
import { DriveSyncResult } from "../drive-sync-result/drive-sync-result";
import { useDriveSync } from "./use-drive-sync";

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
  const { syncing, result, errMsg, importResult, triggerSync } = useDriveSync(lang, driveMode !== "none");
  const uk = lang === "uk";
  const access = driveMode === "none" ? null : driveAccessModes[driveMode];
  const accessCopy = access?.[lang];
  const AccessIcon = access?.Icon;

  const visibleStatus = syncing
    ? "running"
    : result === "error" || result === "warn"
      ? "error"
      : result === "ok"
        ? "success"
        : lastSync?.syncStatus ?? "pending";

  const status = driveSyncStatus(visibleStatus);
  const StatusIcon = status.Icon;

  return (
    <div className="space-y-3">

      {access && accessCopy && AccessIcon && (
        <div className={cn("flex items-start gap-3 rounded-xl border p-4", access.panelClassName)}>
          <AccessIcon size={15} aria-hidden="true" className={cn("mt-0.5 shrink-0", access.colorClassName)} />
          <div>
            <p className={cn("text-sm font-medium", access.colorClassName)}>{accessCopy.title}</p>
            <Note className="mt-0.5 leading-normal">{accessCopy.description}</Note>
            <Note className="mt-1 font-mono text-[11px] leading-normal text-(--subtle)">{accessCopy.detail}</Note>
          </div>
        </div>
      )}

      {driveMode === "none" && (
        <div className={panel + " p-4"}>
          <p className="text-sm font-medium text-(--muted) mb-3">
            {uk ? "Не налаштовано" : "Not configured"}
          </p>
          <p className="text-xs text-(--muted)">{uk
            ? "Спочатку збережіть посилання в картці «Google Sheets цього кабінету». Для приватної таблиці надайте сервісному акаунту платформи доступ на читання."
            : "Save the URL in ‘This cabinet’s Google Sheets’ first. For a private spreadsheet, grant the platform service account read access."}</p>
        </div>
      )}

      {driveMode !== "none" && (
        <div className={panel + " p-5"}>
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <StatusIcon size={14} aria-hidden="true" className={status.className} />
                <span className="text-sm text-(--text) font-medium">{status[lang]}</span>
              </div>
              {lastSync?.lastSyncAt && (
                <p className="text-xs text-(--muted)">
                  {uk ? "Останній синк:" : "Last sync:"}{" "}
                  {new Date(lastSync.lastSyncAt).toLocaleString(uk ? "uk-UA" : "en-GB")}
                </p>
              )}
              {result === null && lastSync?.errorMessage && (
                <p className="text-xs text-[#fca5a5] mt-1 font-mono">{lastSync.errorMessage}</p>
              )}
              <DriveSyncResult result={result} errMsg={errMsg} importResult={importResult} lang={lang} />
            </div>

            <Button
              variant="report"
              onClick={triggerSync}
              disabled={syncing}
              className="min-h-0 shrink-0 gap-2 bg-(--input-bg) text-(--text) hover:bg-(--input-hover)"
            >
              <RefreshCw size={13} className={syncing ? "animate-spin" : ""} />
              {syncing ? (uk ? "Синкаємо…" : "Syncing…") : (uk ? "Синхронізувати" : "Sync now")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
