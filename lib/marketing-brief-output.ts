import { isRecord } from "./api-contracts";
import { parseAgentJson } from "./agent-output";
import { AiExecutionError } from "./ai-execution/contracts";

export const MARKETING_CHANNELS = ["paid_social", "smm", "website"] as const;
export type MarketingChannel = typeof MARKETING_CHANNELS[number];
export interface MarketingCopy {
  objective: string;
  message: string;
  cta: string;
  assets: string[];
  evidenceRefs: string[];
}
export interface MarketingGenerated {
  drafts: Partial<Record<MarketingChannel, MarketingCopy>>;
  invalidChannels: MarketingChannel[];
}
export const MARKETING_OUTPUT_GUARD = `Return JSON with exactly drafts: an object keyed by paid_social, smm, website (only requested channels). Each channel has exactly objective, message, cta (Ukrainian text), assets (array of text suggestions), evidenceRefs (nonempty array of supplied JSON pointers). Never write numbers, prices, discounts, dates or budgets in prose; these are displayed separately from server facts. Do not claim a discount is approved, delivery received, stock available, guaranteed outcomes, scarcity or a superlative. Missing values stay unknown. No other fields.`;

/** Validate channels independently so a bad channel never discards another valid, paid-for draft. */
export function parseMarketingOutput(raw: string, refs: ReadonlySet<string>): MarketingGenerated {
  const invalid = (): never => { throw new AiExecutionError("AI_INVALID_OUTPUT", 502); };
  if (raw.length > 128000) return invalid();
  const {data} = parseAgentJson<unknown>(raw, "object");
  if (!isRecord(data) || Object.keys(data).join() !== "drafts" || !isRecord(data.drafts) ||
      Object.keys(data.drafts).some(k => !MARKETING_CHANNELS.includes(k as MarketingChannel))) return invalid();
  const text = (v: unknown): v is string => typeof v === "string" && !!v.trim() && v.length <= 1500 &&
    !/\p{N}/u.test(v) && !/(?:знижк|уцін|наявн|надійш|надійд|достав|гарант|найкращ|останн|discount|in stock|arriv|deliver|guarantee|best|last chance)/iu.test(v);
  const result: MarketingGenerated = {drafts:{}, invalidChannels:[]};
  for (const channel of MARKETING_CHANNELS) {
    const d = data.drafts[channel];
    if (!isRecord(d) || Object.keys(d).sort().join() !== "assets,cta,evidenceRefs,message,objective" ||
        ![d.objective,d.message,d.cta].every(text) || !Array.isArray(d.assets) || !d.assets.length || d.assets.length > 5 || !d.assets.every(text) ||
        !Array.isArray(d.evidenceRefs) || !d.evidenceRefs.length || d.evidenceRefs.length > 10 || d.evidenceRefs.some(r => typeof r !== "string" || !refs.has(r))) {
      result.invalidChannels.push(channel);
    } else result.drafts[channel] = d as unknown as MarketingCopy;
  }
  return result;
}
