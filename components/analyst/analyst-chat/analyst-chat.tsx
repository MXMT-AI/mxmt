import { useEffect, useRef, useState } from "react";
import { Send, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button/button";
import { controlBase } from "@/components/ui/control-styles/control-styles";
import { Heading } from "@/components/ui/heading/heading";
import { panel } from "@/components/ui/panel/panel-styles";
import { Text } from "@/components/ui/text/text";
import { cn } from "@/lib/utils";
import type { ClassifiedSku, ClassifySummary } from "@/lib/analyst-types";

import { SKU_FLAGS } from "../sku-flags";
import { analystAnalystChatMessages as englishCopy } from "@/messages/en.json";
import { analystAnalystChatMessages as ukrainianCopy } from "@/messages/uk.json";

interface AiMessage {
  role: "user" | "assistant";
  content: string;
}

const suggestedQuestions = {
  uk: [ukrainianCopy.ukЩоТерміновоДозамовити, ukrainianCopy.ukТоп5ПроблемнихПозицій, ukrainianCopy.ukЩоАкційноПросувати],
  en: [englishCopy.enWhatToReorderUrgently, englishCopy.enTop5ProblemItems, englishCopy.enWhatToPromoteOnSale],
};

export function AnalystChat({ skus, summary, businessModel, tenantName, lang }: {
  skus: ClassifiedSku[];
  summary: ClassifySummary;
  businessModel: string | null;
  tenantName: string;
  lang: string;
}) {
  const uk = lang === "uk";
  const title = uk ? ukrainianCopy.titleAskTheAgent : englishCopy.titleAskTheAgent;
  const inputLabel = uk ? ukrainianCopy.inputLabelAskAboutYourAssortment : englishCopy.inputLabelAskAboutYourAssortment;
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
        setAiMsgs((p) => [...p, { role: "assistant", content: `❌ ${uk ? ukrainianCopy.contentError : englishCopy.contentError}: ${errMsg}` }]);
      } else {
        setAiMsgs((p) => [...p, { role: "assistant", content: data.content }]);
      }
    } catch (e) {
      setAiMsgs((p) => [...p, { role: "assistant", content: `❌ ${uk ? ukrainianCopy.contentNetworkError : englishCopy.contentNetworkError}: ${String(e)}` }]);
    } finally {
      setAiLoading(false);
    }
  };

  return (
    <section className={cn(panel, "mb-6 overflow-hidden")}>
      <div className="flex items-center gap-2 border-b border-(--border) px-5 py-3">
        <Sparkles size={14} className="text-accent-yellow" aria-hidden="true" />
        <Heading as="h2" variant="compact" className="font-medium">{title}</Heading>
      </div>

      <div ref={chatRef} role="log" aria-label={title} className="h-56 space-y-3 overflow-auto p-4">
        {aiMsgs.length === 0 && (
          <div className="py-6 text-center">
            <Text variant="body">
              {uk
                ? ukrainianCopy.askAboutASpecificProduct
                : englishCopy.askAboutASpecificProduct}
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
            {uk ? ukrainianCopy.analyzing : englishCopy.analyzing}
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
          className={cn(controlBase, "flex-1 rounded-xl bg-(--surface2) px-4 py-2.5 text-sm placeholder:text-(--subtle) focus:border-accent-cyan/40")}
        />
        <Button
          type="submit"
          variant="icon"
          tone="positive"
          aria-label={uk ? ukrainianCopy.ariaLabelSend : englishCopy.ariaLabelSend}
          disabled={aiLoading || !aiInput.trim()}
          className="rounded-xl px-4"
        >
          <Send size={15} aria-hidden="true" />
        </Button>
      </form>
    </section>
  );
}
