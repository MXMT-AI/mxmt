"use client";

import { useEffect, useState } from "react";

export type AgentSimulation<T> =
  | { status: "loading" }
  | { status: "success"; data: T }
  | { status: "error"; message: string };

export function useAgentSimulation<T>(endpoint: string, request: object): AgentSimulation<T> {
  const body = JSON.stringify(request);
  const [result, setResult] = useState<{
    endpoint: string;
    body: string;
    state: AgentSimulation<T>;
  } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    setResult(null);

    async function simulate() {
      try {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
          signal,
        });
        const data = await response.json();
        if (signal.aborted) return;

        setResult({
          endpoint,
          body,
          state: response.ok
            ? { status: "success", data: data as T }
            : { status: "error", message: typeof data?.error === "string" ? data.error : "Невідома помилка" },
        });
      } catch (error) {
        if (!signal.aborted) {
          setResult({ endpoint, body, state: { status: "error", message: String(error) } });
        }
      }
    }

    void simulate();
    return () => controller.abort();
  }, [endpoint, body]);

  return result?.endpoint === endpoint && result.body === body
    ? result.state
    : { status: "loading" };
}
