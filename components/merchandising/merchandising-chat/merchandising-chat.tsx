"use client";

import { useId, useState } from "react";
import { CHAT_TOPICS, type ChatTopic } from "@/lib/merchandising-chat-contract";
import { chatCopy } from "@/lib/merchandising-chat-copy";
import { ChatThread } from "../chat-thread/chat-thread";
import type { MerchandisingChatProps } from "./chat-types";

export default function MerchandisingChat(props: MerchandisingChatProps) {
  const [topic, setTopic] = useState<ChatTopic>(props.initialTopic ?? "overview");
  const copy = chatCopy[props.lang];
  const id = useId();
  const scenarioExportId = topic === props.initialTopic ? props.scenarioExportId : undefined;
  const signature = JSON.stringify([props.snapshotId, props.filters, props.lang, topic, scenarioExportId]);

  return (
    <div className="space-y-4 p-4 sm:p-5">
      <p className="max-w-3xl text-sm leading-relaxed">{copy.intro}</p>
      <label htmlFor={`${id}-topic`} className="flex max-w-sm flex-col gap-1 text-sm">
        {copy.topic}
        <select
          id={`${id}-topic`}
          name="chat-topic"
          value={topic}
          onChange={event => setTopic(event.target.value as ChatTopic)}
          className="min-h-11 rounded-lg border border-(--border) bg-(--surface) px-3 text-(--text) focus-visible:outline-solid focus-visible:outline-2"
        >
          {CHAT_TOPICS.map(value => <option key={value} value={value}>{copy.topics[value]}</option>)}
        </select>
      </label>
      <ChatThread key={signature} {...props} topic={topic} scenarioExportId={scenarioExportId} />
    </div>
  );
}
