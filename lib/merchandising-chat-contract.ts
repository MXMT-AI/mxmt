/** Public read-only chat contracts; no server imports, provider selection or client-authoritative facts. */
export const CHAT_TOPICS=["overview","sales","stock","repricing","reordering"] as const;
export type ChatTopic=typeof CHAT_TOPICS[number];
export interface ChatHistoryTurn {executionId:string; question:string; topic:ChatTopic}
export interface MerchandisingChatRequest {
  locale?: "uk" | "en";
  mode:"merchandising";requestKey:string;snapshotId:string;question:string;topic:ChatTopic;
  filters?:Partial<Record<"brandId"|"categoryId"|"skuId"|"channelId"|"currency"|"classification"|"ownership"|"supplierId"|"search",string>>;
  history?:ChatHistoryTurn[];scenarioExportId?:string;
}
export interface ChatFactCard {
  id:string;label:"revenue"|"grossProfit"|"stockCost"|"stockUnits";
  value:string|null;currency:string|null;unit:"money"|"units";
  status:"complete"|"partial"|"unavailable";evidenceRef:string;href:string;
}
export interface MerchandisingChatReply {
  mode:"generated"|"fallback"|"clarification";code?:string;executionId?:string;
  answer:{summary:string;recommendations:Array<{text:string;evidenceRefs:string[]}>}|null;
  cards:ChatFactCard[];
  citations:Array<{ref:string;value:string|null;href:string;label?:string;currency?:string|null;scope?:"current"|"priorYear"|"stock"|"scenario"}>;
  context:{snapshotId:string;fingerprint:string;sourceId:string;period:{from:string;to:string;lyFrom?:string;lyTo?:string};timezone:string;
    stockAsOf:string;stockCutoff:string;calculationIds:{sales:string;stock:string};filters:Record<string,string|null>;
    scenarioExportId:string|null;diagnostics:Array<{code:string;count:number}>};
}
