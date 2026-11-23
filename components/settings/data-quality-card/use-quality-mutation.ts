"use client";

import { useRef, useState } from "react";
import { saveDataQuality, type DataQualityChange } from "@/lib/client/data-quality-request";
import type { Lang } from "@/lib/translations";
import { settingsDataQualityCardUseQualityMutationMessages as englishCopy } from "@/messages/en.json";
import { settingsDataQualityCardUseQualityMutationMessages as ukrainianCopy } from "@/messages/uk.json";

export function useQualityMutation({ lang, canManage, loading, reload, onAliasSaved, onError, onMessage }: {
  lang: Lang;
  canManage: boolean;
  loading: boolean;
  reload: () => Promise<void>;
  onAliasSaved: () => void;
  onError: (message: string) => void;
  onMessage: (message: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const copy = lang === "uk" ? ukrainianCopy : englishCopy;
  async function save(change: DataQualityChange) {
    if (!canManage || loading || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    onError("");
    onMessage("");
    let saved = false;
    try {
      await saveDataQuality(change);
      saved = true;
      if (change.action === "alias") onAliasSaved();
      await reload();
      onMessage(change.action === "alias"
        ? copy.aliasSavedRefreshTheCatalog
        : copy.productTypeSaved);
    } catch {
      onError(saved
        ? copy.changesSavedButDiagnosticsCould
        : copy.couldNotSaveChangesCheck);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  return { busy, save };
}
