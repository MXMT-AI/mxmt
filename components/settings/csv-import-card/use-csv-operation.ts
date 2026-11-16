"use client";

import { useRef, useState } from "react";

export function useCsvOperation(canManage: boolean) {
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);

  async function run(task: () => void | Promise<void>, onError: (error: unknown) => void) {
    if (!canManage || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    try {
      await task();
    } catch (error) {
      onError(error);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  return { busy, run };
}
