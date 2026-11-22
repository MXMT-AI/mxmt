"use client";

import { useEffect, useRef, type FormEvent } from "react";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button/button";
import { control } from "@/components/ui/control-styles/control-styles";
import { cn } from "@/lib/utils";
import type { AiMessage } from "../planner-types";
import { plannerPlannerAiChatMessages as englishCopy } from "@/messages/en.json";
import { plannerPlannerAiChatMessages as ukrainianCopy } from "@/messages/uk.json";

const suggestedQuestions = [
  ukrainianCopy.suggestedQuestionsЯкіТовариПріоритетніДляЗакупки,
  ukrainianCopy.suggestedQuestionsДеЄРизикиПеревищенняБюджету,
  ukrainianCopy.suggestedQuestionsЄДубліМіжБрендами,
  ukrainianCopy.suggestedQuestionsЯкРозподілитиБюджетОптимально,
];

export function PlannerAiChat({ messages, input, loading, onInputChange, onSend }: {
  messages: AiMessage[];
  input: string;
  loading: boolean;
  onInputChange: (value: string) => void;
  onSend: () => void;
}) {
  const bottomRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!loading && input.trim()) onSend();
  }

  return (
    <div className="flex flex-col h-[calc(100vh-180px)] max-w-3xl">
      <div role="log" aria-label={ukrainianCopy.ariaLabelПовідомленняAIПомічника} className="flex-1 overflow-auto space-y-4 mb-4">
        {messages.length === 0 ? (
          <div className="text-center py-16">
            <Sparkles size={40} aria-hidden="true" className="mx-auto text-accent-yellow mb-4" />
            <p className="text-(--text) font-semibold mb-2">{ukrainianCopy.запитайтеМенеПроАсортимент}</p>
            <div className="text-(--muted) text-sm space-y-1">
              {suggestedQuestions.map(question => <p key={question}>• {question}</p>)}
            </div>
          </div>
        ) : null}
        {messages.map((message, index) => (
          <div
            key={index}
            className={`max-w-[80%] px-4 py-3 rounded-xl text-sm leading-relaxed whitespace-pre-wrap ${
              message.role === "user"
                ? "ml-auto bg-accent-cyan/10 border border-accent-cyan/20 text-(--text)"
                : "bg-(--surface) border border-(--border) text-(--text)"
            }`}
          >
            {message.content}
          </div>
        ))}
        {loading ? (
          <div role="status" className="bg-(--surface) border border-(--border) rounded-xl px-4 py-3 text-sm text-(--muted) italic max-w-[80%]">{englishCopy.thinking}</div>
        ) : null}
        <div ref={bottomRef} />
      </div>
      <form onSubmit={submit} className="flex gap-3">
        <input
          type="text"
          aria-label={ukrainianCopy.ariaLabelЗапитДоAIПомічника}
          value={input}
          onChange={event => onInputChange(event.target.value)}
          placeholder={ukrainianCopy.placeholderЗапитайтеПроАсортиментБюджетДублі}
          disabled={loading}
          className={cn(control, "flex-1 rounded-xl px-4 py-3 focus:border-accent-cyan/40 placeholder:text-(--subtle)")}
        />
        <Button
          variant="report" tone="positive"
          type="submit"
          aria-label={ukrainianCopy.ariaLabelНадіслатиЗапит}
          disabled={loading || !input.trim()}
          className="px-5 rounded-xl font-medium"
        >
          <span aria-hidden="true">→</span>
        </Button>
      </form>
    </div>
  );
}
