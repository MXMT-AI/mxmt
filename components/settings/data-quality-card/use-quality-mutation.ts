"use client";

import { useRef, useState } from "react";
import { saveDataQuality, type DataQualityChange } from "@/lib/client/data-quality-request";
import type { Lang } from "@/lib/translations";

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
  const copy = (uk: string, en: string) => lang === "uk" ? uk : en;
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
        ? copy("Аліас збережено. Оновіть каталог, щоб застосувати його до товарів.", "Alias saved. Refresh the catalog to apply it to products.")
        : copy("Тип товару збережено.", "Product type saved."));
    } catch {
      onError(saved
        ? copy("Зміни збережено, але діагностику не оновлено. Натисніть «Оновити діагностику».", "Changes saved, but diagnostics could not refresh. Select Refresh diagnostics.")
        : copy("Не вдалося зберегти зміни. Перевірте вибір і повторіть спробу.", "Could not save changes. Check the selection and try again."));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  return { busy, save };
}
