"use client";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useState } from "react";
import { useRouter,useSearchParams } from "next/navigation";
import { useLang } from "@/components/LanguageProvider";
import { useMerchandisingFilters,useScenarioExportPermission } from "@/components/merchandising/MerchandisingShell";
import { CHAT_TOPICS,type ChatTopic,type MerchandisingChatRequest } from "@/lib/merchandising-chat-contract";
import { chatCopy } from "@/lib/merchandising-chat-copy";
import {panel} from "@/components/merchandising/ReportPrimitives";
import { merchandisingHref } from "@/lib/merchandising-navigation";
import { overviewCopy } from "@/lib/overview-copy";
import { useOverview } from "./useOverview";
import OverviewContent from "./OverviewContent";
const Chat=dynamic(()=>import("@/components/merchandising/MerchandisingChat"));
/** Existing auth-aware API wrapper and shared URL filters drive one published Overview. */
export default function OverviewWorkspace() {
  const filters = useMerchandisingFilters()!;
  const { lang } = useLang(),
    copy = overviewCopy[lang],
    params = useSearchParams(),router=useRouter(),allowed=useScenarioExportPermission();
  const [chatLoaded,setChatLoaded]=useState(params.get("chat")==="1");
  const { data, busy, error, refresh } = useOverview(filters);
  if (error)
    return (
      <div
        role="alert"
        className="space-y-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6"
      >
        <h1 className="text-2xl font-bold">{copy.title}</h1>
        <p>
          {error === "SCREEN_SELECTION_MISMATCH" ? copy.mismatch : copy.error}
        </p>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={refresh}
            className="min-h-11 rounded-lg border border-[var(--border)] px-4 py-2 hover:bg-[var(--input-bg)]"
          >
            {copy.refresh}
          </button>
          <Link
            href={merchandisingHref("/settings", new URLSearchParams(params))}
            className="inline-flex min-h-11 items-center underline underline-offset-4"
          >
            {copy.settings}
          </Link>
        </div>
      </div>
    );
  if (busy || !data)
    return (
      <div role="status" aria-live="polite" className="py-6">
        <h1 className="text-2xl font-bold">{copy.title}</h1>
        <p className="mt-3 text-sm text-[var(--muted)]">{copy.loading}</p>
      </div>
    );
  const chatFilters:NonNullable<MerchandisingChatRequest["filters"]>={};
  for(const key of ["brandId","categoryId","skuId","channelId","currency","classification","ownership","supplierId","search"] as const){const v=params.get(key);if(v!==null)chatFilters[key]=v;}
  const topicValue=params.get("chatTopic"),initialTopic=CHAT_TOPICS.includes(topicValue as ChatTopic)?topicValue as ChatTopic:undefined;
  const chatScope=JSON.stringify([data.context.snapshotId,chatFilters,initialTopic,params.get("chatExportId")]);
  return <div className="space-y-6">
    <OverviewContent
      data={data}
      lang={lang}
      query={params.toString()}
      monobrand={data.context.profileMode === "MONOBRAND"}
      onRefresh={refresh}
    />
    <details className={panel} open={params.get("chat")==="1"} onToggle={event=>{
      const open=event.currentTarget.open;if(open)setChatLoaded(true);
      if(open!==(params.get("chat")==="1")){const next=new URLSearchParams(params);if(open)next.set("chat","1");else next.delete("chat");router.replace(`/overview?${next}`,{scroll:false});}
    }}>
      <summary className="min-h-11 cursor-pointer rounded-xl px-5 py-4 text-base font-semibold focus-visible:outline focus-visible:outline-2"><h2 className="inline">{chatCopy[lang].title}</h2></summary>
      {chatLoaded?<Chat key={chatScope} snapshotId={data.context.snapshotId} filters={chatFilters} lang={lang} allowed={allowed} initialTopic={initialTopic} scenarioExportId={params.get("chatExportId")??undefined}/>:null}
    </details>
  </div>;
}
