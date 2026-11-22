"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getAgentProvider } from "@/lib/client/agent-providers";
import { AGENT_ROUTES, COMING_SOON } from "@/components/agents/agents.config";
import type { AgentRunInfo } from "@/components/agents/agents.types";
import { apiFetch } from "@/lib/fetch";
import { readApiJson } from "@/lib/api-response";
import { formatMessage } from "@/i18n/format-message";
import { agentsUseAgentRunsMessages as ukrainianCopy } from "@/messages/uk.json";

export function useAgentRuns({
  analysisDate,
  dateFrom,
  todayStr,
  enabled = true,
  preferSaved = false,
}: {
  analysisDate: string;
  dateFrom: string;
  todayStr: string;
  enabled?: boolean;
  preferSaved?: boolean;
}) {
  const [runs, setRuns] = useState<Record<string, AgentRunInfo>>({});
  const [loading, setLoading] = useState(true);
  const [statusError, setStatusError] = useState<string | null>(null);
  const isHistoricalDate = analysisDate !== todayStr;
  const hasDateFrom = dateFrom !== "";
  const statusRequest = useRef(0);

  const fetchStatus = useCallback(async (fresh = false) => {
    if (!enabled) return;
    const request = ++statusRequest.current;

    try {
      const params = new URLSearchParams({ asOf: analysisDate });
      if (hasDateFrom) params.set("dateFrom", dateFrom);
      if (preferSaved) params.set("saved", "1");
      if (fresh) params.set("fresh", "1");
      const res = await apiFetch(`/api/agents/status?${params.toString()}`);
      if (request !== statusRequest.current) return;
      if (!res.ok) {
        setStatusError(formatMessage(ukrainianCopy.неВдалосяОновитиСтатусАгентів, { status: res.status }));
        return;
      }

      const data = await readApiJson<Record<string, AgentRunInfo>>(res);
      if (request !== statusRequest.current) return;
      setRuns(data ?? {});
      setStatusError(null);
    } catch (error) {
      if (request !== statusRequest.current) return;
      setStatusError(error instanceof Error ? error.message : ukrainianCopy.неВдалосяОновитиСтатусАгентів2);
    } finally {
      if (request === statusRequest.current) setLoading(false);
    }
  }, [analysisDate, dateFrom, enabled, hasDateFrom, preferSaved]);

  useEffect(() => {
    if (!enabled) return;
    fetchStatus();
  }, [enabled, fetchStatus]);

  useEffect(() => {
    const isRunning = Object.values(runs).some((run) =>
      run.status === "running" || run.latestAttempt?.status === "running");
    if (!isRunning) return;
    const intervalId = setInterval(() => void fetchStatus(true), 3000);
    return () => clearInterval(intervalId);
  }, [runs, fetchStatus]);

  const handleRun = useCallback(async (agentId: string) => {
    if (!enabled) return;

    const route = AGENT_ROUTES[agentId];
    if (!route) {
      const msg = COMING_SOON[agentId] ?? ukrainianCopy.msgАгентУРозробці;
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
      [agentId]: prev[agentId]?.status === "done" && prev[agentId]?.isCurrent
        ? { ...prev[agentId], latestAttempt: { status: "running" } }
        : {
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
        const errorMsg = data?.error ?? ukrainianCopy.errorMsgНевідомаПомилка;
        setRuns((prev) => ({
          ...prev,
          [agentId]: prev[agentId]?.status === "done" && prev[agentId]?.isCurrent
            ? { ...prev[agentId], latestAttempt: { status: "error", errorMsg } }
            : {
              ...prev[agentId],
              status: "error" as const,
              errorMsg,
              finishedAt: new Date().toISOString(),
            },
        }));
        return;
      }

      await fetchStatus(true);
    } catch (error) {
      setRuns((prev) => ({
        ...prev,
        [agentId]: prev[agentId]?.status === "done" && prev[agentId]?.isCurrent
          ? { ...prev[agentId], latestAttempt: { status: "error", errorMsg: String(error) } }
          : {
            ...prev[agentId],
            status: "error" as const,
            errorMsg: String(error),
            finishedAt: new Date().toISOString(),
          },
      }));
    }
  }, [analysisDate, dateFrom, enabled, fetchStatus, hasDateFrom, isHistoricalDate]);

  return { runs, loading, statusError, fetchStatus, handleRun };
}
