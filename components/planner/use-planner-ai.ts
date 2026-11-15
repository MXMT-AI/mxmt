"use client";

import { useRef, useState } from "react";
import { requestPlannerAi } from "@/lib/client/planner-ai-request";
import type { Lang } from "@/lib/translations";
import type { AiMessage } from "./planner-types";
import { buildPlannerAiContext, type PlannerAiContext } from "./planner-ai-context";

const errorCopy = {
  uk: "Не вдалося отримати відповідь AI. Спробуйте ще раз.",
  en: "Error contacting AI. Please try again.",
};

export function usePlannerAi(lang: Lang, context: PlannerAiContext) {
  const [messages, setMessages] = useState<AiMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const lock = useRef(false);

  async function send() {
    if (!input.trim() || loading || lock.current) return;
    lock.current = true;
    const userMessage: AiMessage = { role: "user", content: input };
    setMessages(previous => [...previous, userMessage]);
    setInput("");
    setLoading(true);
    try {
      const content = await requestPlannerAi({
        locale: lang,
        systemPrompt: buildPlannerAiContext(context),
        messages: [...messages, userMessage],
      });
      setMessages(previous => [...previous, { role: "assistant", content }]);
    } catch {
      setMessages(previous => [...previous, { role: "assistant", content: errorCopy[lang] }]);
    } finally {
      lock.current = false;
      setLoading(false);
    }
  }

  return { messages, input, setInput, loading, send };
}
