"use client";

import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { useRouter } from "@/i18n/navigation";
import { panel } from "@/components/ui/panel/panel-styles";
import { chatCopy } from "@/lib/merchandising-chat-copy";
import type { Lang } from "@/lib/translations";
import { readOverviewChatParams } from "../overview-chat-params";

const Chat = dynamic(() => import("@/components/merchandising/merchandising-chat/merchandising-chat"));

export function OverviewChatPanel({ snapshotId, lang, allowed, loaded, onLoad }: {
  snapshotId: string;
  lang: Lang;
  allowed: boolean;
  loaded: boolean;
  onLoad: () => void;
}) {
  const params = useSearchParams();
  const router = useRouter();
  const open = params.get("chat") === "1";
  const chat = loaded || open ? readOverviewChatParams(params, snapshotId) : null;

  return (
    <details
      className={panel}
      open={open}
      onToggle={event => {
        const nextOpen = event.currentTarget.open;
        if (nextOpen && !loaded) onLoad();
        if (nextOpen === open) return;

        const next = new URLSearchParams(params);
        if (nextOpen) next.set("chat", "1");
        else next.delete("chat");
        const query = next.toString();
        router.replace(query ? `/overview?${query}` : "/overview", { scroll: false });
      }}
    >
      <summary className="min-h-11 cursor-pointer rounded-xl px-5 py-4 text-base font-semibold focus-visible:outline-solid focus-visible:outline-2">
        <h2 className="inline">{chatCopy[lang].title}</h2>
      </summary>
      {chat ? (
        <Chat
          key={chat.scope}
          snapshotId={snapshotId}
          filters={chat.filters}
          lang={lang}
          allowed={allowed}
          initialTopic={chat.initialTopic}
          scenarioExportId={chat.scenarioExportId}
        />
      ) : null}
    </details>
  );
}
