import { parseAgentJson } from "../agent-output";
import { isRecord } from "../api-contracts";
import { AiExecutionError } from "./contracts";

/** Evidence references are JSON pointers into the immutable facts, never arbitrary model-provided IDs. */
export function evidenceReferences(facts: unknown): string[] {
  const refs: string[] = [];
  const visit = (value: unknown, path: string) => {
    if (value === null || typeof value !== "object") { refs.push(path); return; }
    for (const [key, next] of Object.entries(value)) visit(next, `${path}/${key.replace(/~/g,"~0").replace(/\//g,"~1")}`);
  };
  visit(facts, "");
  return refs;
}
export interface AiAdvice {
  summary: string;
  recommendations: Array<{text: string; evidenceRefs: string[]}>;
}
export const AI_ADVICE_SCHEMA_VERSION = "evidence-advice-v1";
export function parseAiAdvice(raw: string, allowed: ReadonlySet<string>): AiAdvice {
  const invalid = (): never => { throw new AiExecutionError("AI_INVALID_OUTPUT", 502); };
  if (raw.length > 128000) return invalid();
  const {data} = parseAgentJson<unknown>(raw, "object");
  const text = (v: unknown) => typeof v === "string" && Boolean(v.trim()) && v.length <= 4000;
  if (!isRecord(data) || Object.keys(data).sort().join() !== "recommendations,summary" || !text(data.summary) ||
      !Array.isArray(data.recommendations) || data.recommendations.length > 20) return invalid();
  for (const r of data.recommendations) {
    if (!isRecord(r) || Object.keys(r).sort().join() !== "evidenceRefs,text" || !text(r.text) || !Array.isArray(r.evidenceRefs) ||
        !r.evidenceRefs.length || r.evidenceRefs.length > 20 || r.evidenceRefs.some(ref => typeof ref !== "string" || !allowed.has(ref))) return invalid();
  }
  return data as unknown as AiAdvice;
}
