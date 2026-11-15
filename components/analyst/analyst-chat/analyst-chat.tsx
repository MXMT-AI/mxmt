import { useEffect, useRef, useState } from "react";
import { Send, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button/button";
import { Heading } from "@/components/ui/heading/heading";
import { Text } from "@/components/ui/text/text";
import { cn } from "@/lib/utils";
import type { ClassifiedSku, ClassifySummary } from "@/lib/analyst-types";

import { SKU_FLAGS } from "../sku-flags";

interface AiMessage {
  role: "user" | "assistant";
  content: string;
}

const suggestedQuestions = {
  uk: ["Що терміново дозамовити?", "Топ-5 проблемних позицій", "Що акційно просувати?"],
  en: ["What to reorder urgently?", "Top 5 problem items", "What to promote on sale?"],
};

export function AnalystChat({ skus, summary, businessModel, tenantName, lang }: {
  skus: ClassifiedSku[];
  summary: ClassifySummary;
  businessModel: string | null;
  tenantName: string;
  lang: string;
}) {
  const uk = lang === "uk";
  const title = uk ? "Запитати агента" : "Ask the agent";
  const inputLabel = uk ? "Запитайте про стан асортименту…" : "Ask about your assortment…";
  const [aiMsgs, setAiMsgs] = useState<AiMessage[]>([]);
  const [aiInput, setAiInput] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const chatRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const chat = chatRef.current;
    chat?.scrollTo({ top: chat.scrollHeight, behavior: "smooth" });
  }, [aiMsgs]);

  const sendAi = async () => {
    if (!aiInput.trim() || aiLoading) return;
    const msg: AiMessage = { role: "user", content: aiInput };
    setAiMsgs((p) => [...p, msg]);
    setAiInput("");
    setAiLoading(true);

    const systemPrompt = `Ти — Агент Аналітик для магазину "${tenantName}".
Бізнес-модель: ${businessModel ?? "не вказано"}.

ПОТОЧНИЙ СТАН (${new Date().toLocaleDateString(uk ? "uk-UA" : "en-GB")}):
- Всього SKU: ${summary.total}
- 🔥 Хіти: ${summary.hit}
- 🛑 Стокаут ризик: ${summary.stockout}
- 📉 Слоу-мувери: ${summary.slow}
- 💤 Зависших: ${summary.dead}

ТОП ПРОБЛЕМИ:
${skus.filter(s => ["hit","stockout"].includes(s.flag)).slice(0,5)
  .map(s => `- ${SKU_FLAGS[s.flag].emoji} ${s.name}: залишок ${s.stock} шт, ${s.daysOfStock} днів запасу, lead time ${s.leadTime}д`)
  .join("\n") || "Немає критичних проблем"}

Відповідай структуровано. Давай конкретні рекомендації з числами. Мова відповіді відповідає мові запиту.`;

    try {
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locale: lang, systemPrompt, messages: [...aiMsgs, msg] }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        const errMsg = data.error ?? `HTTP ${res.status}`;
        setAiMsgs((p) => [...p, { role: "assistant", content: `❌ ${uk ? "Помилка" : "Error"}: ${errMsg}` }]);
      } else {
        setAiMsgs((p) => [...p, { role: "assistant", content: data.content }]);
      }
    } catch (e) {
      setAiMsgs((p) => [...p, { role: "assistant", content: `❌ ${uk ? "Помилка мережі" : "Network error"}: ${String(e)}` }]);
    } finally {
      setAiLoading(false);
    }
  };

  return (
    <section className="mb-6 overflow-hidden rounded-xl border border-(--border) bg-(--surface)">
      <div className="flex items-center gap-2 border-b border-(--border) px-5 py-3">
        <Sparkles size={14} className="text-accent-yellow" aria-hidden="true" />
        <Heading as="h2" variant="compact" className="font-medium">{title}</Heading>
      </div>

      <div ref={chatRef} role="log" aria-label={title} className="h-56 space-y-3 overflow-auto p-4">
        {aiMsgs.length === 0 && (
          <div className="py-6 text-center">
            <Text variant="body">
              {uk
                ? "Запитайте про конкретний товар, ситуацію зі стоком або рекомендації"
                : "Ask about a specific product, stock situation or recommendations"}
            </Text>
            <div className="mt-3 flex flex-wrap justify-center gap-2">
              {suggestedQuestions[uk ? "uk" : "en"].map((question) => (
                <Button
                  key={question}
                  onClick={() => setAiInput(question)}
                  className="bg-(--input-bg) px-3 py-1.5 font-sans text-[11px] hover:border-(--border-faint)"
                >
                  {question}
                </Button>
              ))}
            </div>
          </div>
        )}
        {aiMsgs.map((message, index) => (
          <div
            key={index}
            className={cn(
              "max-w-[85%] rounded-xl border px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap text-(--text)",
              message.role === "user"
                ? "ml-auto border-accent-cyan/20 bg-accent-cyan/10"
                : "border-(--border) bg-(--surface2)",
            )}
          >
            {message.content}
          </div>
        ))}
        {aiLoading && (
          <Text variant="body" role="status" className="max-w-[85%] rounded-xl border border-(--border) bg-(--surface2) px-4 py-2.5 italic">
            {uk ? "Аналізую…" : "Analyzing…"}
          </Text>
        )}
      </div>

      <form
        className="flex gap-2 border-t border-(--border) p-3"
        onSubmit={(event) => {
          event.preventDefault();
          void sendAi();
        }}
      >
        <input
          type="text"
          value={aiInput}
          onChange={(event) => setAiInput(event.target.value)}
          disabled={aiLoading}
          aria-label={inputLabel}
          placeholder={inputLabel}
          className="min-w-0 flex-1 rounded-xl border border-(--border) bg-(--surface2) px-4 py-2.5 text-sm text-(--text) placeholder:text-(--subtle) focus:border-accent-cyan/40"
        />
        <Button
          type="submit"
          variant="icon"
          aria-label={uk ? "Надіслати" : "Send"}
          disabled={aiLoading || !aiInput.trim()}
          className="rounded-xl border-accent-cyan/20 bg-accent-cyan/10 px-4 text-accent-cyan hover:bg-accent-cyan/20 hover:text-accent-cyan"
        >
          <Send size={15} aria-hidden="true" />
        </Button>
      </form>
    </section>
  );
}
