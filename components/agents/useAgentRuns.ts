"use client";

import { useCallback, useEffect, useState } from "react";
import { getAgentProvider } from "@/components/settings/AgentProvidersCard";
import { AGENT_ROUTES, COMING_SOON } from "@/components/agents/agents.config";
import type { AgentRunInfo } from "@/components/agents/agents.types";

export function useAgentRuns({
  analysisDate,
  dateFrom,
  todayStr,
}: {
  analysisDate: string;
  dateFrom: string;
  todayStr: string;
}) {
  const [runs, setRuns] = useState<Record<string, AgentRunInfo>>({});
  const [loading, setLoading] = useState(true);
  const isHistoricalDate = analysisDate !== todayStr;
  const hasDateFrom = dateFrom !== "";

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/agents/inventory-analyst");
      if (res.ok) {
        const data = await res.json();
        setRuns(data ?? {});
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  useEffect(() => {
    const isRunning = Object.values(runs).some((run) => run.status === "running");
    if (!isRunning) return;
    const intervalId = setInterval(fetchStatus, 3000);
    return () => clearInterval(intervalId);
  }, [runs, fetchStatus]);

  const handleRun = useCallback(async (agentId: string) => {
    const route = AGENT_ROUTES[agentId];
    if (!route) {
      const msg = COMING_SOON[agentId] ?? "Агент у розробці.";
      setRuns((prev) => ({
        ...prev,
        [agentId]: {
          ...(prev[agentId] ?? {}),
          id: "pending",
          status: "error" as const,
          startedAt: new Date().toISOString(),
          finishedAt: new Date().toISOString(),
          errorMsg: msg,
        },
      }));
      return;
    }

    const provider = getAgentProvider(agentId);
    setRuns((prev) => ({
      ...prev,
      [agentId]: {
        ...(prev[agentId] ?? {}),
        id: "pending",
        status: "running" as const,
        startedAt: new Date().toISOString(),
        agentType: agentId,
        tenantId: "",
        entityId: "all",
        input: {},
      },
    }));

    try {
      const res = await fetch(route, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider,
          ...(isHistoricalDate ? { asOf: analysisDate } : {}),
          ...(hasDateFrom ? { dateFrom } : {}),
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        setRuns((prev) => ({
          ...prev,
          [agentId]: {
            ...prev[agentId],
            status: "error" as const,
            errorMsg: data.error ?? "Невідома помилка",
            finishedAt: new Date().toISOString(),
          },
        }));
        return;
      }

      await fetchStatus();
    } catch (error) {
      setRuns((prev) => ({
        ...prev,
        [agentId]: {
          ...prev[agentId],
          status: "error" as const,
          errorMsg: String(error),
          finishedAt: new Date().toISOString(),
        },
      }));
    }
  }, [analysisDate, dateFrom, fetchStatus, hasDateFrom, isHistoricalDate]);

  return { runs, loading, fetchStatus, handleRun };
}
