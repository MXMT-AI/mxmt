"use client";

import { useEffect, useRef, type FormEvent } from "react";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button/button";
import { control } from "@/components/ui/control-styles/control-styles";
import { cn } from "@/lib/utils";
import type { AiMessage } from "../planner-types";

const suggestedQuestions = [
  "Які товари пріоритетні для закупки?",
  "Де є ризики перевищення бюджету?",
  "Є дублі між брендами?",
  "Як розподілити бюджет оптимально?",
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
      <div role="log" aria-label="Повідомлення AI-помічника" className="flex-1 overflow-auto space-y-4 mb-4">
        {messages.length === 0 ? (
          <div className="text-center py-16">
            <Sparkles size={40} aria-hidden="true" className="mx-auto text-accent-yellow mb-4" />
            <p className="text-(--text) font-semibold mb-2">Запитайте мене про асортимент</p>
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
          <div role="status" className="bg-(--surface) border border-(--border) rounded-xl px-4 py-3 text-sm text-(--muted) italic max-w-[80%]">
            Thinking…
          </div>
        ) : null}
        <div ref={bottomRef} />
      </div>
      <form onSubmit={submit} className="flex gap-3">
        <input
          type="text"
          aria-label="Запит до AI-помічника"
          value={input}
          onChange={event => onInputChange(event.target.value)}
          placeholder="Запитайте про асортимент, бюджет, дублі…"
          disabled={loading}
          className={cn(control, "flex-1 rounded-xl px-4 py-3 focus:border-accent-cyan/40 placeholder:text-(--subtle)")}
        />
        <Button
          variant="report"
          type="submit"
          aria-label="Надіслати запит"
          disabled={loading || !input.trim()}
          className="px-5 bg-accent-cyan/10 border-accent-cyan/20 text-accent-cyan rounded-xl font-medium hover:bg-accent-cyan/20 hover:text-accent-cyan"
        >
          <span aria-hidden="true">→</span>
        </Button>
      </form>
    </div>
  );
}
