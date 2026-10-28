"use client";
import {memo,useEffect,useId,useRef,useState,type FormEvent} from "react";
import {apiFetch} from "@/lib/fetch";
import {readApiJson} from "@/lib/api-response";
import type {Lang} from "@/lib/translations";
import {CHAT_TOPICS,type ChatTopic,type ChatHistoryTurn,type MerchandisingChatRequest,type MerchandisingChatReply} from "@/lib/merchandising-chat-contract";
import {chatCopy,chatNotice,citationCopy} from "@/lib/merchandising-chat-copy";
import {button} from "./ReportPrimitives";

/** Exact fact strings and server-owned citations are rendered separately from non-authoritative prose. */
export const ChatReply=memo(function ChatReply({reply,lang}:{reply:MerchandisingChatReply;lang:Lang}){
 const copy=chatCopy[lang],citation=citationCopy[lang],locale=lang==="uk"?"uk-UA":"en-US";
 const date=(value:string)=>new Intl.DateTimeFormat(locale,{dateStyle:"medium",timeZone:"UTC"}).format(new Date(`${value}T00:00:00Z`));
 return <div className="min-w-0 space-y-4">
   {reply.answer?<div className="space-y-2"><h3 className="font-semibold">{copy.answer}</h3><p className="whitespace-pre-wrap break-words leading-relaxed">{reply.answer.summary}</p>
     {reply.answer.recommendations.length?<ul className="list-disc space-y-2 pl-5">{reply.answer.recommendations.map((item,i)=><li className="whitespace-pre-wrap break-words" key={i}>{item.text}</li>)}</ul>:null}
     <p className="text-xs leading-relaxed opacity-80">{copy.warning}</p></div>:<p role="status" className="text-sm leading-relaxed">{chatNotice(reply.code,copy)}</p>}
   <div className="space-y-2"><h3 className="font-semibold">{copy.facts}</h3>{!reply.cards.length?<p className="text-sm">{copy.unavailable}</p>:null}
     <p className="text-xs leading-relaxed">{copy.period}: <time dateTime={reply.context.period.from}>{date(reply.context.period.from)}</time> – <time dateTime={reply.context.period.to}>{date(reply.context.period.to)}</time>. {copy.stockDate}: <time dateTime={reply.context.stockAsOf}>{date(reply.context.stockAsOf)}</time>.</p>
     <dl className="grid min-w-0 gap-3 sm:grid-cols-2">{reply.cards.map(card=><div key={card.id} className="min-w-0 border-l-2 border-[var(--border)] pl-3">
       <dt className="text-xs">{copy.labels[card.label]}{card.currency?` (${card.currency})`:""}{card.status==="partial"?` · ${card.label==="grossProfit"?copy.partial:copy.incomplete}`:""}</dt>
       <dd className="mt-1 break-words text-base tabular-nums" translate="no">{card.value===null?copy.unavailable:<>{card.value} {card.unit==="units"?copy.units:card.currency??copy.unknownCurrency}</>}</dd>
       <dd><a href={card.href} className="inline-flex min-h-11 items-center text-xs underline underline-offset-4 focus-visible:outline focus-visible:outline-2">{copy.source}<span className="sr-only">: {copy.labels[card.label]} {card.currency}</span></a></dd>
     </div>)}</dl>
     <p className="text-xs leading-relaxed opacity-80">{copy.scope}</p>
   </div>
   {reply.citations.length?<details><summary className="min-h-11 cursor-pointer py-2 text-sm font-semibold focus-visible:outline focus-visible:outline-2">{copy.sources} ({reply.citations.length})</summary>
     <ol className="list-decimal space-y-2 pl-5">{reply.citations.map(c=><li className="min-w-0 break-words text-xs" key={c.ref}>
       <span>{(citation.fields as Record<string,string>)[c.label??""]??citation.metric}{c.scope?` · ${citation[c.scope]}`:""}{c.scope==="priorYear"&&reply.context.period.lyFrom&&reply.context.period.lyTo?` (${date(reply.context.period.lyFrom)} – ${date(reply.context.period.lyTo)})`:""}: </span>
       <span translate="no">{c.value??copy.unavailable}{c.currency?` ${c.currency}`:""}</span>{" "}<a href={c.href} className="inline-flex min-h-11 items-center underline underline-offset-4 focus-visible:outline focus-visible:outline-2">{copy.source}</a></li>)}</ol>
   </details>:null}
 </div>;
});

interface Props{snapshotId:string;filters:MerchandisingChatRequest["filters"];lang:Lang;allowed:boolean;initialTopic?:ChatTopic;scenarioExportId?:string}
/** Changing scope/topic starts a fresh local thread; messages are never stored in browser persistence. */
export default function MerchandisingChat(props:Props){
 const [topic,setTopic]=useState<ChatTopic>(props.initialTopic??"overview"),copy=chatCopy[props.lang],id=useId();
 const scenarioExportId=topic===props.initialTopic?props.scenarioExportId:undefined;
 const signature=JSON.stringify([props.snapshotId,props.filters,props.lang,topic,scenarioExportId]);
 return <div className="space-y-4 p-4 sm:p-5">
   <p className="max-w-3xl text-sm leading-relaxed">{copy.intro}</p>
   <label htmlFor={`${id}-topic`} className="flex max-w-sm flex-col gap-1 text-sm">{copy.topic}
     <select id={`${id}-topic`} name="chat-topic" value={topic} onChange={e=>setTopic(e.target.value as ChatTopic)} className="min-h-11 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-[var(--text)] focus-visible:outline focus-visible:outline-2">
       {CHAT_TOPICS.map(t=><option key={t} value={t}>{copy.topics[t]}</option>)}
     </select>
   </label>
   <ChatThread key={signature} {...props} topic={topic} scenarioExportId={scenarioExportId}/>
 </div>;
}
/** Preserve a request nonce on uncertain network results and ignore responses after a scope change/unmount. */
function ChatThread({snapshotId,filters,lang,allowed,topic,scenarioExportId}:Props&{topic:ChatTopic}){
 const copy=chatCopy[lang],id=useId();
 const [question,setQuestion]=useState(""),[history,setHistory]=useState<ChatHistoryTurn[]>([]);
 const [turns,setTurns]=useState<Array<{key:string;question:string;reply?:MerchandisingChatReply}>>([]);
 const [busy,setBusy]=useState(false),[error,setError]=useState("");
 const pendingRetry=["AI_EXECUTION_IN_PROGRESS","AGENT_RUN_ALREADY_RUNNING"].includes(turns.at(-1)?.reply?.code??"");
 const lock=useRef(false),controller=useRef<AbortController|null>(null),lastRequest=useRef<MerchandisingChatRequest|null>(null),errorRef=useRef<HTMLParagraphElement>(null);
 useEffect(()=>()=>controller.current?.abort(),[]);
 useEffect(()=>{if(error)errorRef.current?.focus();},[error]);
 async function send(body:MerchandisingChatRequest){
   if(lock.current||!allowed)return;lock.current=true;setBusy(true);setError("");lastRequest.current=body;
   const active=new AbortController();controller.current=active;
   setTurns(current=>current.some(t=>t.key===body.requestKey)?current:[...current,{key:body.requestKey,question:body.question}]);
   try{
     const response=await apiFetch("/api/ai",{method:"POST",headers:{"Content-Type":"application/json"},signal:active.signal,body:JSON.stringify(body)});
     const data=await readApiJson<MerchandisingChatReply&Record<string,unknown>>(response);
     if(active.signal.aborted)return;
     if(!["generated","fallback","clarification"].includes(data.mode)||!Array.isArray(data.cards)||data.context?.snapshotId!==snapshotId)throw new Error(data.code??"AI_CHAT_CONNECTION_ERROR");
     setTurns(current=>current.map(t=>t.key===body.requestKey?{...t,reply:data}:t));
     if(data.mode==="generated"&&data.executionId)setHistory(current=>current.some(t=>t.executionId===data.executionId)?current:[...current,{executionId:data.executionId!,question:body.question,topic:body.topic}]);
   }catch(cause){if(!active.signal.aborted)setError(cause instanceof Error?cause.message:"AI_CHAT_CONNECTION_ERROR");}
   finally{lock.current=false;if(!active.signal.aborted)setBusy(false);}
 }
 function submit(event:FormEvent){event.preventDefault();if(!question.trim()){setError("AI_CHAT_EMPTY_QUESTION");return;}if(busy||turns.length>=6)return;
   const body:MerchandisingChatRequest={mode:"merchandising",requestKey:crypto.randomUUID(),snapshotId,filters,topic,question:question.trim(),history,...(scenarioExportId?{scenarioExportId}:{})};
   setQuestion("");void send(body);
 }
 return <div className="space-y-4">
   {!allowed?<p className="text-sm">{copy.readOnly}</p>:null}
   <div role="log" aria-label={copy.title} aria-relevant="additions" className="max-h-[36rem] space-y-5 overflow-y-auto overscroll-contain">
     {!turns.length?<p className="py-2 text-sm opacity-80">{copy.empty}</p>:null}
     {turns.map(turn=><article key={turn.key} className="min-w-0 space-y-4 border-t border-[var(--border)] pt-4 text-sm">
       <div><h3 className="font-semibold">{copy.you}</h3><p className="mt-1 whitespace-pre-wrap break-words">{turn.question}</p></div>
       {turn.reply?<ChatReply reply={turn.reply} lang={lang}/>:null}
     </article>)}
   </div>
   {busy?<p role="status" aria-live="polite" className="text-sm">{copy.sending}</p>:null}
   {error||pendingRetry?<div>{error?<p ref={errorRef} tabIndex={-1} role="alert" className="text-sm focus-visible:outline focus-visible:outline-2">{error==="AI_CHAT_CONNECTION_ERROR"?copy.network:chatNotice(error,copy)}</p>:null}
     <button type="button" className={button+" mt-2"} disabled={busy} onClick={()=>lastRequest.current&&void send(lastRequest.current)}>{copy.retry}</button></div>:null}
   {turns.length>=6?<p role="status" className="text-sm">{copy.limit}</p>:null}
   <form onSubmit={submit} className="space-y-2">
     <label htmlFor={`${id}-question`} className="block text-sm font-medium">{copy.question}</label>
     <textarea id={`${id}-question`} name="merchandising-question" autoComplete="off" required rows={3} maxLength={2000} value={question} onChange={e=>setQuestion(e.target.value)} disabled={!allowed||busy||turns.length>=6} placeholder={copy.placeholder}
       className="w-full resize-y rounded-lg border border-[var(--border)] bg-[var(--input-bg)] p-3 text-sm text-[var(--text)] focus-visible:outline focus-visible:outline-2 disabled:opacity-60"/>
     <div className="flex flex-wrap gap-2"><button type="submit" className={button} disabled={!allowed||busy||turns.length>=6}>{busy?copy.sending:copy.send}</button>
       <button type="button" className={button} disabled={busy} onClick={()=>{setTurns([]);setHistory([]);setQuestion("");setError("");lastRequest.current=null;}}>{copy.reset}</button></div>
   </form>
 </div>;
}
