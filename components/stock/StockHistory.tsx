"use client";
import {useId} from "react";
import type {StockHistory as History} from "@/lib/stock-history";
import type {Lang} from "@/lib/translations";
import {formatTableValue as format} from "@/lib/data-reporting-ui";
/** Month-end dots and gaps share an exact-value table; missing history never becomes a zero or interpolated point. */
export default function StockHistory({history,currency,lang}:{history:History&{unavailableReason?:"COHORT_LIMIT"};currency:string|null;lang:Lang}){
 const id=useId(),uk=lang==="uk",locale=uk?"uk-UA":"en-GB",block=history.byCurrency.find(b=>b.currency===currency);
 const copy=uk?{empty:"Потрібно 30 послідовних днів спостережень",body:"Щоденні залишки зберігаються з дня підключення. Пропущені дні та неповні дані не замінюються нулями.",basis:"Ті самі SKU, що у вибраному знімку та фільтрах. Значення — фактичні спостереження в останній календарний день місяця, не баланс о 23:59. Канали продажів не змінюють склад.",cost:"За собівартістю",month:"Дата",current:"Останні 12 місяців",ly:"Рік тому",qty:"Кількість",dates:"Час спостережень",none:"Немає підтвердженого спостереження",chart:"Спостереження вартості стоку за місяцями",table:"Точні значення та повнота історії",coverage:"SKU зі спостереженнями"}:{empty:"30 consecutive observation days required",body:"Daily stock is retained from connection onward. Missing days and incomplete evidence are not replaced with zeroes.",basis:"The same SKUs as the selected snapshot and filters. Values are actual observations on the last calendar date of each month, not a 23:59 closing balance. Sales channels do not change stock.",cost:"At cost",month:"Date",current:"Latest 12 months",ly:"Prior year",qty:"Quantity",dates:"Observation times",none:"No verified observation",chart:"Monthly observed stock cost",table:"Exact values and history coverage",coverage:"Observed SKUs"};
 if(!block||block.state!=="READY")return <div className="my-5 min-h-64 border border-dashed border-(--border) rounded-lg flex flex-col justify-center text-center px-6 space-y-3"><h4 className="font-semibold">{history.unavailableReason==="COHORT_LIMIT"?(uk?"Звузьте фільтри для історії залишків":"Narrow filters to view stock history"):copy.empty}</h4><p className="text-sm text-(--muted)">{copy.body}</p>{block?<p className="text-sm tabular-nums">{block.completeDays} / {block.requiredDays}</p>:null}</div>;
 const number=(v:string|null)=>v===null?null:Number(v),values=block.points.flatMap(p=>[number(p.current.stockCost),number(p.priorYear.stockCost)]).filter((v):v is number=>v!==null&&Number.isFinite(v)),max=Math.max(1,...values);
 const date=(v:string)=>new Intl.DateTimeFormat(locale,{year:"numeric",month:"short",day:"numeric",timeZone:"UTC"}).format(new Date(`${v}T12:00:00Z`));
 const time=(v:string|null)=>v?new Intl.DateTimeFormat(locale,{dateStyle:"short",timeStyle:"short",timeZone:"UTC"}).format(new Date(v))+" UTC":"—";
 return <div className="mt-4 space-y-4 min-w-0">
  <p className="text-sm text-(--muted)">{copy.basis}</p>
  {values.length===0?<p className="text-sm text-(--muted)">{copy.none}</p>:null}
  <svg viewBox="0 0 600 200" className="w-full h-auto" role="img" aria-labelledby={`${id}-title ${id}-description`}>
   <title id={`${id}-title`}>{copy.chart} · {currency??"—"}</title><desc id={`${id}-description`}>{copy.table}. {copy.basis}</desc>
   <path d="M24 16V176H580" fill="none" stroke="var(--border)"/>
   {block.points.map((point,i)=>{const x=38+i*48;return <g key={point.current.date}>
    {[{p:point.current,color:"var(--accent)",dx:-4},{p:point.priorYear,color:"var(--muted)",dx:4}].map(({p,color,dx})=>{const v=number(p.stockCost);return v!==null&&Number.isFinite(v)?<circle key={dx} cx={x+dx} cy={168-v/max*140} r={4} fill={color}><title>{date(p.date)}: {format(p.stockCost,"money",locale)}</title></circle>:null;})}
    <text x={x} y={194} textAnchor="middle" fontSize="10" fill="var(--muted)">{point.current.date.slice(5,7)}</text>
   </g>;})}
  </svg>
  <p className="text-sm flex flex-wrap gap-4"><span><span aria-hidden="true" className="inline-block w-2 h-2 rounded-full bg-(--accent) mr-2"/>{copy.current}</span><span><span aria-hidden="true" className="inline-block w-2 h-2 rounded-full bg-(--muted) mr-2"/>{copy.ly}</span><span>{copy.cost} · {currency??"—"}</span></p>
  <details><summary className="cursor-pointer text-sm py-2 focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-(--accent)">{copy.table}</summary><div className="overflow-x-auto"><table className="w-full text-sm tabular-nums"><caption className="sr-only">{copy.table}</caption><thead><tr>{[copy.month,copy.cost,copy.qty,copy.coverage,copy.dates].map(label=><th key={label} scope="col" className="p-2 text-left">{label}</th>)}</tr></thead><tbody>{block.points.flatMap(point=>[point.current,point.priorYear]).map(point=><tr key={point.date} className="border-t border-(--border)"><th scope="row" className="p-2 text-left font-normal whitespace-nowrap">{date(point.date)}</th><td className="p-2">{point.stockCost===null?copy.none:format(point.stockCost,"money",locale)}</td><td className="p-2">{format(point.quantity,"quantity",locale)}</td><td className="p-2">{point.observedCount} / {point.cohortSize}</td><td className="p-2 whitespace-nowrap">{time(point.firstObservedAt)}<br/>{time(point.lastObservedAt)}</td></tr>)}</tbody></table></div></details>
 </div>;
}
