"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { apiFetch } from "@/lib/fetch";
import { readApiJson } from "@/lib/api-response";
import type { ChatHistoryTurn, MerchandisingChatRequest, MerchandisingChatReply } from "@/lib/merchandising-chat-contract";
import type { ChatThreadProps } from "./merchandising-chat/chat-types";

type ChatTurn = { key: string; question: string; reply?: MerchandisingChatReply };

export function useMerchandisingChat({ snapshotId, filters, lang, allowed, topic, scenarioExportId }: ChatThreadProps) {
  const [question, setQuestion] = useState("");
  const [history, setHistory] = useState<ChatHistoryTurn[]>([]);
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pendingRetry = ["AI_EXECUTION_IN_PROGRESS", "AGENT_RUN_ALREADY_RUNNING"].includes(turns.at(-1)?.reply?.code ?? "");
  const lock = useRef(false);
  const controller = useRef<AbortController | null>(null);
  const lastRequest = useRef<MerchandisingChatRequest | null>(null);

  useEffect(() => () => controller.current?.abort(), []);

  async function send(body: MerchandisingChatRequest) {
    if (lock.current || !allowed) return;
    lock.current = true;
    setBusy(true);
    setError("");
    lastRequest.current = body;
    const active = new AbortController();
    controller.current = active;
    setTurns(current => current.some(turn => turn.key === body.requestKey)
      ? current
      : [...current, { key: body.requestKey, question: body.question }]);
    try {
      const response = await apiFetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: active.signal,
        body: JSON.stringify(body),
      });
      const data = await readApiJson<MerchandisingChatReply & Record<string, unknown>>(response);
      if (active.signal.aborted) return;
      if (!["generated", "fallback", "clarification"].includes(data.mode) || !Array.isArray(data.cards) || data.context?.snapshotId !== snapshotId) {
        throw new Error(data.code ?? "AI_CHAT_CONNECTION_ERROR");
      }
      setTurns(current => current.map(turn => turn.key === body.requestKey ? { ...turn, reply: data } : turn));
      if (data.mode === "generated" && data.executionId) {
        setHistory(current => current.some(turn => turn.executionId === data.executionId)
          ? current
          : [...current, { executionId: data.executionId!, question: body.question, topic: body.topic }]);
      }
    } catch (cause) {
      if (!active.signal.aborted) setError(cause instanceof Error ? cause.message : "AI_CHAT_CONNECTION_ERROR");
    } finally {
      lock.current = false;
      if (!active.signal.aborted) setBusy(false);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!question.trim()) {
      setError("AI_CHAT_EMPTY_QUESTION");
      return;
    }
    if (busy || turns.length >= 6) return;
    const body: MerchandisingChatRequest = {
      locale: lang, mode: "merchandising", requestKey: crypto.randomUUID(),
      snapshotId, filters, topic, question: question.trim(), history,
      ...(scenarioExportId ? { scenarioExportId } : {}),
    };
    setQuestion("");
    void send(body);
  }

  function retry() {
    if (lastRequest.current) void send(lastRequest.current);
  }

  function reset() {
    setTurns([]);
    setHistory([]);
    setQuestion("");
    setError("");
    lastRequest.current = null;
  }

  return { question, setQuestion, turns, busy, error, pendingRetry, submit, retry, reset };
}
