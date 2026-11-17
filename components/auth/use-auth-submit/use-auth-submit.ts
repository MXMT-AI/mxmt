"use client";

import { useRef, useState } from "react";
import { isRecord } from "@/lib/api-contracts";

export function useAuthSubmit({ endpoint, fallbackError, onSuccess }: {
  endpoint: "/api/auth/login" | "/api/auth/register";
  fallbackError: string;
  onSuccess: () => void;
}) {
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const inFlight = useRef(false);

  async function submit(payload: Record<string, string>) {
    if (inFlight.current) return;
    inFlight.current = true;
    setError("");
    setLoading(true);
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data: unknown = await response.json();
      if (!response.ok) {
        setError(isRecord(data) && typeof data.error === "string" && data.error ? data.error : fallbackError);
        return;
      }
      onSuccess();
    } catch {
      setError(fallbackError);
    } finally {
      inFlight.current = false;
      setLoading(false);
    }
  }

  return { error, loading, setError, submit };
}
