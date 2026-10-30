import {createElement} from "react";
import {renderToStaticMarkup} from "../helpers/render-localized";
import {expect,it,vi} from "vitest";
vi.mock("next/link",()=>({default:({children,...props}:Record<string,unknown>)=>createElement("a",props,children as string)}));
import MerchandisingChat,{ChatReply} from "@/components/merchandising/MerchandisingChat";
import type {MerchandisingChatReply} from "@/lib/merchandising-chat-contract";
const reply:MerchandisingChatReply={mode:"fallback",code:"AI_POLICY_REQUIRED",answer:null,citations:[],cards:[
 {id:"gp",label:"grossProfit",value:"0.0000",currency:"UAH",unit:"money",status:"partial",evidenceRef:"/sales/0/current/coveredGrossProfit",href:"/sales?snapshotId=frozen"},
 {id:"stock",label:"stockCost",value:null,currency:"UAH",unit:"money",status:"unavailable",evidenceRef:"/stock/byCurrency/0/stockCost",href:"/stock?snapshotId=frozen"}],
 context:{snapshotId:"frozen",fingerprint:"hash",sourceId:"source",period:{from:"2026-09-01",to:"2026-09-30"},timezone:"Europe/Kyiv",stockAsOf:"2026-10-25",stockCutoff:"2026-10-25T10:00:00Z",calculationIds:{sales:"sales",stock:"daily"},filters:{},scenarioExportId:null,diagnostics:[]}};
it("renders exact zero profit as partial and unknown stock as unavailable with pinned report links",()=>{
 const html=renderToStaticMarkup(createElement(ChatReply,{reply,lang:"uk"}));
 expect(html).toContain("0.0000");expect(html).toContain("Лише покрита частина");expect(html).toContain("Немає підтверджених даних");expect(html).toContain('/sales?snapshotId=frozen');expect(html).toContain("ще не ввімкнено");expect(html).toContain('dateTime="2026-09-01"');
});
it("escapes generated content instead of rendering provider HTML",()=>{
 const html=renderToStaticMarkup(createElement(ChatReply,{reply:{...reply,mode:"generated",answer:{summary:"<script>unsafe()</script>",recommendations:[]}},lang:"en"}));
 expect(html).not.toContain("<script>");expect(html).toContain("&lt;script&gt;");expect(html).toContain("recommendations");
});
it("labels the bounded input and disables paid execution for viewers",()=>{
 const html=renderToStaticMarkup(createElement(MerchandisingChat,{snapshotId:"frozen",filters:{},lang:"uk",allowed:false}));
 expect(html).toContain('name="merchandising-question"');expect(html).toContain('maxLength="2000"');expect(html).toContain('disabled=""');expect(html).toContain("доступ аналітика");expect(html).not.toContain("systemPrompt");
});
