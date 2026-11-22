"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchDataQuality, type DataQualityQuery } from "@/lib/client/data-quality-request";
import type { Lang } from "@/lib/translations";
import type { Quality } from "./data-quality-types";
import { settingsDataQualityCardUseDataQualityMessages as englishCopy } from "@/messages/en.json";
import { settingsDataQualityCardUseDataQualityMessages as ukrainianCopy } from "@/messages/uk.json";

export function useDataQuality({ page, search, code, revision, lang, onError }: DataQualityQuery & {
  revision: number;
  lang: Lang;
  onError: (error: string) => void;
}) {
  const [data, setData] = useState<Quality | null>(null);
  const [loading, setLoading] = useState(false);
  const requestId = useRef(0);
  const load = useCallback(async (signal?: AbortSignal) => {
    const id = ++requestId.current;
    setLoading(true);
    try {
      const result = await fetchDataQuality({ page, search, code }, signal);
      if (!signal?.aborted && id === requestId.current) setData(result);
    } catch (error) {
      if (!signal?.aborted && id === requestId.current) throw error;
    } finally {
      if (!signal?.aborted && id === requestId.current) setLoading(false);
    }
  }, [page, search, code]);

  useEffect(() => {
    const controller = new AbortController();
    onError("");
    void load(controller.signal).catch(() => {
      if (!controller.signal.aborted) onError(lang === "uk"
        ? ukrainianCopy.couldNotLoadDataQuality
        : englishCopy.couldNotLoadDataQuality);
    });
    return () => {
      controller.abort();
      requestId.current++;
    };
  }, [load, lang, revision, onError]);

  return { data, loading, load };
}
