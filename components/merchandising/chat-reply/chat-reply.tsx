"use client";
import {memo} from "react";
import { Link } from "@/i18n/navigation";
import type {Lang} from "@/lib/translations";
import type {MerchandisingChatReply} from "@/lib/merchandising-chat-contract";
import {chatCopy,chatNotice,citationCopy} from "@/lib/merchandising-chat-copy";

export const ChatReply=memo(function ChatReply({reply,lang}:{reply:MerchandisingChatReply;lang:Lang}){
 const copy=chatCopy[lang],citation=citationCopy[lang],locale=lang==="uk"?"uk-UA":"en-GB";
 const date=(value:string)=>new Intl.DateTimeFormat(locale,{dateStyle:"medium",timeZone:"UTC"}).format(new Date(`${value}T00:00:00Z`));
 return <div className="min-w-0 space-y-4">
   {reply.answer?<div className="space-y-2"><h3 className="font-semibold">{copy.answer}</h3><p className="whitespace-pre-wrap wrap-break-word leading-relaxed">{reply.answer.summary}</p>
     {reply.answer.recommendations.length?<ul className="list-disc space-y-2 pl-5">{reply.answer.recommendations.map((item,i)=><li className="whitespace-pre-wrap wrap-break-word" key={i}>{item.text}</li>)}</ul>:null}
     <p className="text-xs leading-relaxed opacity-80">{copy.warning}</p></div>:<p role="status" className="text-sm leading-relaxed">{chatNotice(reply.code,copy)}</p>}
   <div className="space-y-2"><h3 className="font-semibold">{copy.facts}</h3>{!reply.cards.length?<p className="text-sm">{copy.unavailable}</p>:null}
     <p className="text-xs leading-relaxed">{copy.period}: <time dateTime={reply.context.period.from}>{date(reply.context.period.from)}</time> – <time dateTime={reply.context.period.to}>{date(reply.context.period.to)}</time>. {copy.stockDate}: <time dateTime={reply.context.stockAsOf}>{date(reply.context.stockAsOf)}</time>.</p>
     <dl className="grid min-w-0 gap-3 sm:grid-cols-2">{reply.cards.map(card=><div key={card.id} className="min-w-0 border-l-2 border-(--border) pl-3">
       <dt className="text-xs">{copy.labels[card.label]}{card.currency?` (${card.currency})`:""}{card.status==="partial"?` · ${card.label==="grossProfit"?copy.partial:copy.incomplete}`:""}</dt>
       <dd className="mt-1 wrap-break-word text-base tabular-nums" translate="no">{card.value===null?copy.unavailable:<>{card.value} {card.unit==="units"?copy.units:card.currency??copy.unknownCurrency}</>}</dd>
       <dd><Link href={card.href} className="inline-flex min-h-11 items-center text-xs underline underline-offset-4 focus-visible:outline-solid focus-visible:outline-2">{copy.source}<span className="sr-only">: {copy.labels[card.label]} {card.currency}</span></Link></dd>
     </div>)}</dl>
     <p className="text-xs leading-relaxed opacity-80">{copy.scope}</p>
   </div>
   {reply.citations.length?<details><summary className="min-h-11 cursor-pointer py-2 text-sm font-semibold focus-visible:outline-solid focus-visible:outline-2">{copy.sources} ({reply.citations.length})</summary>
     <ol className="list-decimal space-y-2 pl-5">{reply.citations.map(c=><li className="min-w-0 wrap-break-word text-xs" key={c.ref}>
       <span>{(citation.fields as Record<string,string>)[c.label??""]??citation.metric}{c.scope?` · ${citation[c.scope]}`:""}{c.scope==="priorYear"&&reply.context.period.lyFrom&&reply.context.period.lyTo?` (${date(reply.context.period.lyFrom)} – ${date(reply.context.period.lyTo)})`:""}: </span>
       <span translate="no">{c.value??copy.unavailable}{c.currency?` ${c.currency}`:""}</span>{" "}<Link href={c.href} className="inline-flex min-h-11 items-center underline underline-offset-4 focus-visible:outline-solid focus-visible:outline-2">{copy.source}</Link></li>)}</ol>
   </details>:null}
 </div>;
});
