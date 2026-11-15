"use client";

import { useEffect, useId, useRef } from "react";
import { Button } from "@/components/ui/button/button";
import { chatCopy, chatNotice } from "@/lib/merchandising-chat-copy";
import { ChatReply } from "../chat-reply/chat-reply";
import { useMerchandisingChat } from "../use-merchandising-chat";
import type { ChatThreadProps } from "../merchandising-chat/chat-types";

export function ChatThread(props: ChatThreadProps) {
  const { lang, allowed } = props;
  const copy = chatCopy[lang];
  const id = useId();
  const { question, setQuestion, turns, busy, error, pendingRetry, submit, retry, reset } = useMerchandisingChat(props);
  const errorRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => { if (error) errorRef.current?.focus(); }, [error]);

  return (
    <div className="space-y-4">
      {!allowed ? <p className="text-sm">{copy.readOnly}</p> : null}
      <div role="log" aria-label={copy.title} aria-relevant="additions" className="max-h-144 space-y-5 overflow-y-auto overscroll-contain">
        {!turns.length ? <p className="py-2 text-sm opacity-80">{copy.empty}</p> : null}
        {turns.map(turn => (
          <article key={turn.key} className="min-w-0 space-y-4 border-t border-(--border) pt-4 text-sm">
            <div>
              <h3 className="font-semibold">{copy.you}</h3>
              <p className="mt-1 whitespace-pre-wrap wrap-break-word">{turn.question}</p>
            </div>
            {turn.reply ? <ChatReply reply={turn.reply} lang={lang} /> : null}
          </article>
        ))}
      </div>
      {busy ? <p role="status" aria-live="polite" className="text-sm">{copy.sending}</p> : null}
      {error || pendingRetry ? (
        <div>
          {error ? (
            <p ref={errorRef} tabIndex={-1} role="alert" className="text-sm focus-visible:outline-solid focus-visible:outline-2">
              {error === "AI_CHAT_CONNECTION_ERROR" ? copy.network : chatNotice(error, copy)}
            </p>
          ) : null}
          <Button variant="report" className="mt-2" disabled={busy} onClick={retry}>{copy.retry}</Button>
        </div>
      ) : null}
      {turns.length >= 6 ? <p role="status" className="text-sm">{copy.limit}</p> : null}
      <form onSubmit={submit} className="space-y-2">
        <label htmlFor={`${id}-question`} className="block text-sm font-medium">{copy.question}</label>
        <textarea
          id={`${id}-question`}
          name="merchandising-question"
          autoComplete="off"
          required
          rows={3}
          maxLength={2000}
          value={question}
          onChange={event => setQuestion(event.target.value)}
          disabled={!allowed || busy || turns.length >= 6}
          placeholder={copy.placeholder}
          className="w-full resize-y rounded-lg border border-(--border) bg-(--input-bg) p-3 text-sm text-(--text) focus-visible:outline-solid focus-visible:outline-2 disabled:opacity-60"
        />
        <div className="flex flex-wrap gap-2">
          <Button variant="report" type="submit" disabled={!allowed || busy || turns.length >= 6}>{busy ? copy.sending : copy.send}</Button>
          <Button variant="report" disabled={busy} onClick={reset}>{copy.reset}</Button>
        </div>
      </form>
    </div>
  );
}
