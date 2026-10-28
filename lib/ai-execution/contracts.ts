import { financialDecimal as D } from "../financial-decimal.mjs";
import { isRecord } from "../api-contracts";
import type { AiProvider } from "../ai";

export class AiExecutionError extends Error {
  constructor(readonly code: string, readonly status = 409) {
    super(code);
  }
}
/** Keep library/context errors consistent at AI entry points without exposing database exception text. */
export function aiExecutionFailure(error:unknown):AiExecutionError {
  if(error instanceof AiExecutionError)return error;
  const code=(error as {code?:string})?.code;
  if(code==="SCREEN_SNAPSHOT_NOT_FOUND")return new AiExecutionError("AI_CONTEXT_NOT_FOUND",404);
  if(code==="SCREEN_VERSION_UNSUPPORTED")return new AiExecutionError("AI_CONTEXT_UNSUPPORTED");
  if(code==="SALES_REPORT_NOT_FOUND"||code==="DAILY_CALCULATION_NOT_FOUND")return new AiExecutionError("AI_CONTEXT_INCOMPLETE");
  return new AiExecutionError("AI_EXECUTION_FAILED",500);
}
export interface AiPrincipal { tenantId: string; userId: string }
export interface TokenUsage {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}
export interface AttemptResult {
  text: string;
  usage?: TokenUsage;
  quality?: "EXACT" | "ESTIMATED";
  requestId?: string;
  model?: string;
  complete?: boolean;
}
export interface CapabilityLimits {
  periodCap: string;
  requestCap: string;
  maxInputTokens: number;
  maxOutputTokens: number;
  maxAttempts: number;
}
/** Rates are monetary units per million tokens; input excludes separately billed cache tokens. */
export interface AiBudgetPolicy {
  version: 1;
  currency: string;
  provider: AiProvider;
  model: string;
  pricingRevision: string;
  rates: Record<keyof TokenUsage, string>;
  periodCap: string;
  capabilities: Record<string, CapabilityLimits>;
}
export const fail = (code = "AI_INVALID_INPUT", status = 400): never => { throw new AiExecutionError(code, status); };
/** Validate bounded opaque IDs without accepting whitespace or control characters. */
export function identifier(value: unknown): string {
  if (typeof value !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,159}$/.test(value)) return fail();
  return value;
}
/** Require nonblank text within the caller's explicit character bound. */
export function boundedText(value: unknown, max = 2000): string {
  if (typeof value !== "string" || !value.trim() || value.length > max) return fail();
  return value;
}
/** Normalize nonnegative monetary strings to the ledger's eight-place precision. */
export function money(value: unknown): string {
  if (typeof value !== "string" || !/^\d{1,12}(\.\d{1,8})?$/.test(value)) return fail("AI_INVALID_POLICY");
  return D(value).toFixed(8);
}
/** Require exactly the four supported, nonnegative integer token categories. */
export function validateUsage(value: TokenUsage): TokenUsage {
  if (!isRecord(value) || Object.keys(value).sort().join() !== "cacheRead,cacheWrite,input,output" ||
      ![value.input, value.output, value.cacheRead, value.cacheWrite].every(n => Number.isSafeInteger(n) && n >= 0 && n <= 10_000_000))
    return fail("AI_INVALID_USAGE");
  return value;
}
/** Price disjoint token categories using the immutable rates, rounding monetary fractions upward. */
export function usageCost(usage: TokenUsage, policy: AiBudgetPolicy): string {
  validateUsage(usage);
  return Object.entries(usage).reduce((sum, [key, count]) =>
    sum.plus(D(policy.rates[key as keyof TokenUsage]).times(count)), D(0))
    .div(1_000_000).toDecimalPlaces(8, 0).toFixed(8);
}
/** Validate and copy explicit provider pricing, caps and bounded per-capability execution limits. */
export function validatePolicy(input: AiBudgetPolicy): AiBudgetPolicy {
  if (!isRecord(input) || input.version !== 1 || !/^[A-Z]{3}$/.test(input.currency) ||
      !["openai", "anthropic"].includes(input.provider) || !isRecord(input.rates) || !isRecord(input.capabilities))
    return fail("AI_INVALID_POLICY");
  identifier(input.model); identifier(input.pricingRevision);
  const rates = Object.fromEntries(["input", "output", "cacheRead", "cacheWrite"].map(k => [k, money(input.rates[k as keyof TokenUsage])])) as AiBudgetPolicy["rates"];
  const capabilities: Record<string, CapabilityLimits> = {};
  const entries = Object.entries(input.capabilities);
  if (!entries.length || entries.length > 20) return fail("AI_INVALID_POLICY");
  for (const [key, limits] of entries) {
    identifier(key);
    if (!isRecord(limits) || !Number.isSafeInteger(limits.maxInputTokens) || limits.maxInputTokens < 1 || limits.maxInputTokens > 200000 ||
        !Number.isSafeInteger(limits.maxOutputTokens) || limits.maxOutputTokens < 1 || limits.maxOutputTokens > 16000 ||
        !Number.isSafeInteger(limits.maxAttempts) || limits.maxAttempts < 1 || limits.maxAttempts > 3) return fail("AI_INVALID_POLICY");
    capabilities[key] = {periodCap: money(limits.periodCap), requestCap: money(limits.requestCap), maxInputTokens: limits.maxInputTokens, maxOutputTokens: limits.maxOutputTokens, maxAttempts: limits.maxAttempts};
  }
  return {version: 1, currency: input.currency, provider: input.provider, model: input.model,
    pricingRevision: input.pricingRevision, rates, periodCap: money(input.periodCap), capabilities};
}
/** Reserve the highest applicable input/cache rate and the complete output allowance. */
export function attemptAllowance(policy: AiBudgetPolicy, limits: CapabilityLimits): string {
  const highestInput = [policy.rates.input, policy.rates.cacheRead, policy.rates.cacheWrite]
    .reduce((highest, rate) => D(rate).gt(highest) ? D(rate) : highest, D(0));
  return highestInput.times(limits.maxInputTokens).plus(D(policy.rates.output).times(limits.maxOutputTokens))
    .div(1_000_000).toDecimalPlaces(8, 0).toFixed(8);
}
