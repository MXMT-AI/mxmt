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
  const { filters, initialTopic, scenarioExportId, scope } = readOverviewChatParams(params, snapshotId);

  return (
    <details
      className={panel}
      open={params.get("chat") === "1"}
      onToggle={event => {
        const open = event.currentTarget.open;
        if (open) onLoad();
        if (open !== (params.get("chat") === "1")) {
          const next = new URLSearchParams(params);
          if (open) next.set("chat", "1");
          else next.delete("chat");
          router.replace(`/overview?${next}`, { scroll: false });
        }
      }}
    >
      <summary className="min-h-11 cursor-pointer rounded-xl px-5 py-4 text-base font-semibold focus-visible:outline-solid focus-visible:outline-2">
        <h2 className="inline">{chatCopy[lang].title}</h2>
      </summary>
      {loaded ? (
        <Chat key={scope} snapshotId={snapshotId} filters={filters} lang={lang} allowed={allowed} initialTopic={initialTopic} scenarioExportId={scenarioExportId} />
      ) : null}
    </details>
  );
}
