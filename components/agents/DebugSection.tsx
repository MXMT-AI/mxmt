"use client";

import { useState } from "react";
import { Check, ChevronDown, ChevronUp, Copy } from "lucide-react";

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setCopyError(false);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
      setCopyError(true);
      setTimeout(() => setCopyError(false), 1500);
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="flex items-center gap-1 text-[9px] font-mono px-2 py-0.5 rounded-sm border border-(--border) text-(--subtle) hover:text-(--text) hover:bg-(--input-bg) transition-colors shrink-0"
    >
      {copied ? <Check size={9} className="text-accent-cyan" /> : <Copy size={9} />}
      {copied ? "copied" : copyError ? "failed" : "copy"}
    </button>
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
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="border border-(--border) rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen((value) => !value)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/2 transition-colors text-left"
      >
        <span className="text-[10px] font-mono uppercase tracking-widest text-(--subtle)">{title}</span>
        <div className="flex items-center gap-2">
          <span className="text-[9px] font-mono text-(--subtle)">{content.length} chars</span>
          {open ? <ChevronUp size={12} className="text-(--subtle)" /> : <ChevronDown size={12} className="text-(--subtle)" />}
        </div>
      </button>
      {open && (
        <div className="border-t border-(--border)">
          <div className="flex justify-end px-3 py-1.5 bg-(--surface2)">
            <CopyButton text={content} />
          </div>
          <pre
            className="px-4 py-3 text-[11px] leading-relaxed text-(--text) overflow-x-auto max-h-72 overflow-y-auto"
            style={{ fontFamily: mono ? "monospace" : "inherit", whiteSpace: "pre-wrap", wordBreak: "break-word" }}
          >
            {content}
          </pre>
        </div>
      )}
    </div>
  );
}
