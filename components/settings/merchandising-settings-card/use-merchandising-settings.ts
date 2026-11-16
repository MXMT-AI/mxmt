"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/fetch";
import { readApiJson } from "@/lib/api-response";
import type { SettingsResource } from "@/lib/merchandising-settings";
import type { Lang } from "@/lib/translations";
import type { Payload } from "./merchandising-settings-types";

export function useMerchandisingSettings(resource: SettingsResource, page: number, search: string, lang: Lang) {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const requestId = useRef(0);

  const load = useCallback(async (signal?: AbortSignal) => {
    const id = ++requestId.current;
    const response = await apiFetch(
      `/api/settings/merchandising?resource=${resource}&page=${page}&q=${encodeURIComponent(search)}`,
      { signal, cache: "no-store" },
    );
    const result = await readApiJson<Payload>(response);
    if (!response.ok || !result.client) throw new Error("SETTINGS_UNAVAILABLE");
    if (!signal?.aborted && id === requestId.current) setData(result);
  }, [resource, page, search]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    load(controller.signal)
      .catch(() => {
        if (!controller.signal.aborted) setError(lang === "uk"
          ? "Не вдалося завантажити налаштування. Спробуйте ще раз."
          : "Could not load settings. Try again.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => {
      controller.abort();
      requestId.current++;
    };
  }, [load, lang]);

  return { data, error, loading, load, clear: () => setData(null) };
}
