"use client";

import { useCallback, useEffect, useState } from "react";
import { getAgentProvider } from "@/components/settings/AgentProvidersCard";
import { AGENT_ROUTES, COMING_SOON } from "@/components/agents/agents.config";
import type { AgentRunInfo } from "@/components/agents/agents.types";
import { apiFetch } from "@/lib/fetch";
import { readApiJson } from "@/lib/api-response";

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
  const [statusError, setStatusError] = useState<string | null>(null);
  const isHistoricalDate = analysisDate !== todayStr;
  const hasDateFrom = dateFrom !== "";

  const fetchStatus = useCallback(async () => {
    try {
      const params = new URLSearchParams({ asOf: analysisDate });
      if (hasDateFrom) params.set("dateFrom", dateFrom);
      const res = await apiFetch(`/api/agents/status?${params.toString()}`);
      if (!res.ok) {
        setStatusError(`Не вдалося оновити статус агентів (${res.status})`);
        return;
      }

      const data = await readApiJson<Record<string, AgentRunInfo>>(res);
      setRuns(data ?? {});
      setStatusError(null);
    } catch (error) {
      setStatusError(error instanceof Error ? error.message : "Не вдалося оновити статус агентів");
    } finally {
      setLoading(false);
    }
  }, [analysisDate, dateFrom, hasDateFrom]);

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
        id: "pending",
        status: "running" as const,
        startedAt: new Date().toISOString(),
        output: prev[agentId]?.output,
        isCurrent: true,
      },
    }));

    try {
      const res = await apiFetch(route, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider,
          ...(isHistoricalDate ? { asOf: analysisDate } : {}),
          ...(hasDateFrom ? { dateFrom } : {}),
        }),
      });
      const data = await readApiJson<{ error?: string }>(res);

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

  return { runs, loading, statusError, fetchStatus, handleRun };
}
