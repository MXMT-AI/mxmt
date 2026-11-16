"use client";

import { useEffect, useEffectEvent } from "react";
import { fetchCsvUpload } from "@/lib/client/csv-import-request";
import type { CsvPreview } from "./csv-import-types";

function shouldPoll(preview: CsvPreview | null) {
  return preview?.state === "QUEUED" && !["FAILED", "PAUSED"].includes(preview.job?.state ?? "");
}

export function useCsvImportPolling({ preview, onUpdate, onActive, onError }: {
  preview: CsvPreview | null;
  onUpdate: (preview: CsvPreview) => void;
  onActive: () => void | Promise<void>;
  onError: () => void;
}) {
  const update = useEffectEvent(onUpdate);
  const activated = useEffectEvent(onActive);
  const failed = useEffectEvent(onError);
  const id = preview?.id;
  const enabled = shouldPoll(preview);

  useEffect(() => {
    if (!id || !enabled) return;
    const controller = new AbortController();
    let inFlight = false;
    let stopped = false;
    const tick = async () => {
      if (inFlight || stopped) return;
      inFlight = true;
      try {
        const next = await fetchCsvUpload(id, controller.signal);
        if (controller.signal.aborted) return;
        if (!shouldPoll(next)) {
          stopped = true;
          clearInterval(timer);
        }
        update(next);
        if (next.state === "ACTIVE") await activated();
      } catch {
        if (!controller.signal.aborted) failed();
      } finally {
        inFlight = false;
      }
    };
    const timer = setInterval(() => void tick(), 3000);
    return () => {
      stopped = true;
      controller.abort();
      clearInterval(timer);
    };
  }, [id, enabled]);
}
