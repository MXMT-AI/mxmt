"use client";

import { useRef, useState } from "react";
import { apiFetch } from "@/lib/fetch";
import type { Lang } from "@/lib/translations";
import { settingsDriveSyncCardUseDriveSyncMessages as englishCopy } from "@/messages/en.json";
import { settingsDriveSyncCardUseDriveSyncMessages as ukrainianCopy } from "@/messages/uk.json";

interface DriveImportResult {
  skus: number;
  inventory: number;
  sales: number;
  sheets: { name: string; imported: string; skipped: string }[];
}

export interface DriveSyncState {
  syncing: boolean;
  result: "ok" | "warn" | "error" | null;
  errMsg: string;
  importResult: DriveImportResult | null;
}

const initialState: DriveSyncState = { syncing: false, result: null, errMsg: "", importResult: null };

export function useDriveSync(lang: Lang, enabled: boolean) {
  const [state, setState] = useState<DriveSyncState>(initialState);
  const inFlight = useRef(false);

  async function triggerSync() {
    if (!enabled || inFlight.current) return;
    inFlight.current = true;
    setState({ ...initialState, syncing: true });
    try {
      const response = await apiFetch("/api/sync/drive", { method: "POST" });
      const data = await response.json();
      if (!response.ok) {
        setState({ ...initialState, result: "error", errMsg: data.error ?? englishCopy.errMsgUnknownError });
        return;
      }
      setState({
        syncing: false,
        result: data.warning ? "warn" : "ok",
        errMsg: data.warning || "",
        importResult: {
          skus: data.skus ?? 0,
          inventory: data.inventory ?? 0,
          sales: data.sales ?? 0,
          sheets: data.sheets ?? [],
        },
      });
    } catch {
      setState({ ...initialState, result: "error", errMsg: lang === "uk" ? ukrainianCopy.errMsgNetworkError : englishCopy.errMsgNetworkError });
    } finally {
      inFlight.current = false;
    }
  }

  return { ...state, triggerSync };
}
