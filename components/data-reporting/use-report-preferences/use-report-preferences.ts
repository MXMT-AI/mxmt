"use client";

import { useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/fetch";
import { normalizeTablePreferences, type DataTableKey, type InitialTablePreference } from "@/lib/data-table-preferences";
import { responseMessage } from "@/lib/client/data-reporting-response";

type SaveState = "idle" | "saving" | "saved" | "error";

export function useReportPreferences(initialPreferences: Partial<Record<DataTableKey, InitialTablePreference>>, activeTab: DataTableKey) {
  const [preferences, setPreferences] = useState(() => normalizeTablePreferences(initialPreferences));
  const [saveStates, setSaveStates] = useState<Partial<Record<DataTableKey, SaveState>>>({});
  const controllers = useRef<Partial<Record<DataTableKey, AbortController>>>({});

  useEffect(() => {
    const pending = controllers.current;
    return () => {
      for (const controller of Object.values(pending)) controller.abort();
    };
  }, []);

  async function updatePreference(next: InitialTablePreference) {
    const key = activeTab;
    setPreferences(current => ({ ...current, [key]: next }));
    controllers.current[key]?.abort();
    const controller = new AbortController();
    controllers.current[key] = controller;
    setSaveStates(current => ({ ...current, [key]: "saving" }));
    try {
      const response = await apiFetch(`/api/data/preferences/${key}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(await responseMessage(response));
      if (!controller.signal.aborted) setSaveStates(current => ({ ...current, [key]: "saved" }));
    } catch {
      if (!controller.signal.aborted) setSaveStates(current => ({ ...current, [key]: "error" }));
    } finally {
      if (controllers.current[key] === controller) delete controllers.current[key];
    }
  }

  function resetSaveState(key: DataTableKey) {
    setSaveStates(current => ({ ...current, [key]: "idle" }));
  }

  return { preference: preferences[activeTab], saveState: saveStates[activeTab] ?? "idle", updatePreference, resetSaveState };
}
