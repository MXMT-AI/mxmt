"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Copy } from "lucide-react";
import { Button } from "@/components/ui/button/button";

type CopyStatus = "idle" | "copied" | "failed";

function CopyButton({ text }: { text: string }) {
  const [status, setStatus] = useState<CopyStatus>("idle");
  const resetTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const attempt = useRef(0);

  useEffect(() => () => {
    attempt.current += 1;
    clearTimeout(resetTimer.current);
  }, []);

  async function handleCopy() {
    const currentAttempt = ++attempt.current;
    clearTimeout(resetTimer.current);

    let result: CopyStatus;
    try {
      await navigator.clipboard.writeText(text);
      result = "copied";
    } catch {
      result = "failed";
    }

    if (attempt.current !== currentAttempt) return;
    setStatus(result);
    resetTimer.current = setTimeout(() => setStatus("idle"), 1500);
  }

  return (
    <>
      <Button
        onClick={handleCopy}
        aria-label="Копіювати текст"
        className="shrink-0 gap-1 rounded-sm px-2 py-0.5 text-[9px] text-(--subtle)"
      >
        {status === "copied"
          ? <Check size={9} className="text-accent-cyan" aria-hidden="true" />
          : <Copy size={9} aria-hidden="true" />}
        {status === "idle" ? "copy" : status}
      </Button>
      <span role="status" className="sr-only">
        {status === "copied" && "Текст скопійовано."}
        {status === "failed" && "Не вдалося скопіювати текст."}
      </span>
    </>
  );
}

export default function DebugSection({
  title,
  content,
  mono = true,
  defaultOpen = false,
}: {
  title: string;
  content: string;
  mono?: boolean;
  defaultOpen?: boolean;
}) {
  return (
    <details open={defaultOpen} className="group/debug rounded-xl border border-(--border)">
      <summary className="flex w-full cursor-pointer list-none items-center justify-between gap-2 rounded-xl px-4 py-3 text-left transition-colors hover:bg-white/2 [&::-webkit-details-marker]:hidden">
        <span className="text-[10px] font-mono uppercase tracking-widest text-(--subtle)">{title}</span>
        <span className="flex shrink-0 items-center gap-2">
          <span className="text-[9px] font-mono text-(--subtle)">{content.length} chars</span>
          <ChevronDown size={12} className="text-(--subtle) group-open/debug:rotate-180" aria-hidden="true" />
        </span>
      </summary>
      <div className="border-t border-(--border)">
        <div className="flex justify-end bg-(--surface2) px-3 py-1.5">
          <CopyButton text={content} />
        </div>
        <pre className={`max-h-72 overflow-auto whitespace-pre-wrap px-4 py-3 text-[11px] leading-relaxed break-words text-(--text) ${mono ? "font-mono" : "[font-family:inherit]"}`}>
          {content}
        </pre>
      </div>
    </details>
  );
}
