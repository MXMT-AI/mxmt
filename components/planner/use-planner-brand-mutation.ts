"use client";

import { useRef, useState } from "react";
import { savePlannerBrand, deletePlannerBrand, PlannerBrandRequestError, type PlannerBrandInput } from "@/lib/client/planner-brand-request";

export function usePlannerBrandMutation() {
  const [operation, setOperation] = useState<"save" | "delete" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const lock = useRef(false);

  async function run(action: "save" | "delete", request: () => Promise<void>) {
    if (lock.current) return false;
    lock.current = true;
    setOperation(action);
    setError(null);
    try {
      await request();
      return true;
    } catch (cause) {
      setError(cause instanceof PlannerBrandRequestError ? cause.code : "PLANNER_BRAND_REQUEST_FAILED");
      return false;
    } finally {
      lock.current = false;
      setOperation(null);
    }
  }

  return {
    operation,
    busy: operation !== null,
    error,
    save: (id: string | null, input: PlannerBrandInput) => run("save", () => savePlannerBrand(id, input)),
    remove: (id: string) => run("delete", () => deletePlannerBrand(id)),
  };
}
