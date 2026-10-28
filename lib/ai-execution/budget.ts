import "server-only";
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "../prisma";
import type { SqlClient, SqlDatabase } from "../connectors/database";
import { financialDecimal as D } from "../financial-decimal.mjs";
import { AGENT_RUN_STALE_AFTER_MS } from "../agent-runs";
import { payloadHash } from "../connectors/order-storage";
import { assertAiPrincipal } from "./context";
import { AiExecutionError, boundedText, identifier, validatePolicy, usageCost, validateUsage,
  type AiPrincipal, type AiBudgetPolicy, type TokenUsage } from "./contracts";

export interface BudgetPeriod {
  id: string; policy: AiBudgetPolicy; spent: string; reserved: string;
}
export interface ExecutionRow {
  id: string; runId: string; periodId: string; capability: string; fingerprint: string;
  state: "RUNNING" | "DONE" | "ERROR"; held: string; charged: string; result: unknown;
  errorCode: string | null; metadata: {policy: AiBudgetPolicy; allowance: string; maxAttempts: number; [key: string]: unknown};
}
export async function aiTransaction<T>(p: AiPrincipal, db: SqlDatabase, fn: (tx: SqlClient) => Promise<T>, admin = false) {
  return db.$transaction(async tx => {
    await tx.$queryRaw(Prisma.sql`SELECT id FROM "Tenant" WHERE id=${p.tenantId} FOR UPDATE`);
    await assertAiPrincipal(p, tx, admin);
    return fn(tx);
  });
}
/** Administrative provisioning only; no route or default policy activates paid calls. Explicit UTC instants define the reset. */
export async function createAiBudgetPeriod(p: AiPrincipal, input: {startsAt: string; endsAt: string; policy: AiBudgetPolicy; approvalReference: string}, db: SqlDatabase = prisma) {
  const policy = validatePolicy(input.policy), start = new Date(input.startsAt), end = new Date(input.endsAt);
  const utcInstant = (value: string, date: Date) => typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/.test(value) &&
    Number.isFinite(date.getTime()) && date.toISOString().replace(".000Z","Z") === value.replace(".000Z","Z");
  if (!utcInstant(input.startsAt,start) || !utcInstant(input.endsAt,end) || start >= end || end.getTime()-start.getTime()>366*86400000)
    throw new AiExecutionError("AI_INVALID_PERIOD", 400);
  boundedText(input.approvalReference);
  return aiTransaction(p, db, async tx => {
    const [overlap] = await tx.$queryRaw<Array<{id: string}>>(Prisma.sql`SELECT id FROM "AiBudgetPeriod" WHERE "tenantId"=${p.tenantId} AND "startsAt"<${end} AND "endsAt">${start} LIMIT 1`);
    if (overlap) throw new AiExecutionError("AI_PERIOD_OVERLAP");
    const id = randomUUID();
    await tx.$executeRaw(Prisma.sql`INSERT INTO "AiBudgetPeriod" (id,"tenantId","startsAt","endsAt",policy,"approvedBy","approvalReference") VALUES (${id},${p.tenantId},${start},${end},${JSON.stringify(policy)}::jsonb,${p.userId},${input.approvalReference})`);
    return id;
  }, true);
}
export async function setAiBudgetEnabled(p: AiPrincipal, periodId: string, enabled: boolean, approvalReference: string, db: SqlDatabase = prisma) {
  if (typeof enabled !== "boolean") throw new AiExecutionError("AI_INVALID_POLICY", 400);
  identifier(periodId); boundedText(approvalReference);
  return aiTransaction(p, db, async tx => {
    const n = await tx.$executeRaw(Prisma.sql`UPDATE "AiBudgetPeriod" SET enabled=${enabled} WHERE id=${periodId} AND "tenantId"=${p.tenantId}`);
    if (!n) throw new AiExecutionError("AI_POLICY_NOT_FOUND", 404);
    await tx.$executeRaw(Prisma.sql`INSERT INTO "MerchandisingAction" (id,"tenantId","actorId",action,"entityType","entityId","idempotencyKey",before,after,context)
      VALUES (${randomUUID()},${p.tenantId},${p.userId},'AI_BUDGET_ENABLED','AI_BUDGET_PERIOD',${periodId},${randomUUID()},'{}',${JSON.stringify({enabled, approvalReference})}::jsonb,'{}')`);
  }, true);
}
export async function activeAiBudget(p: AiPrincipal, tx: SqlClient, now: Date): Promise<BudgetPeriod> {
  const [period] = await tx.$queryRaw<BudgetPeriod[]>(Prisma.sql`SELECT id,policy,spent::text,reserved::text FROM "AiBudgetPeriod" WHERE "tenantId"=${p.tenantId} AND enabled AND "startsAt"<=${now} AND "endsAt">${now}`);
  if (!period) throw new AiExecutionError("AI_POLICY_REQUIRED");
  period.policy = validatePolicy(period.policy);
  return period;
}
export async function executionByKey(p: AiPrincipal, key: string, tx: SqlClient) {
  const [row] = await tx.$queryRaw<ExecutionRow[]>(Prisma.sql`SELECT *,held::text,charged::text FROM "AiExecution" WHERE "tenantId"=${p.tenantId} AND "requestKey"=${key}`);
  return row ?? null;
}
export async function executionById(p: AiPrincipal, id: string, tx: SqlClient) {
  const [row] = await tx.$queryRaw<ExecutionRow[]>(Prisma.sql`SELECT *,held::text,charged::text FROM "AiExecution" WHERE "tenantId"=${p.tenantId} AND id=${id}`);
  if (!row) throw new AiExecutionError("AI_EXECUTION_NOT_FOUND", 404);
  return row;
}
export async function reserveAiExecution(p: AiPrincipal, data: {key: string; fingerprint: string; capability: string; period: BudgetPeriod; allowance: string; maxAttempts: number; metadata: object}, tx: SqlClient, now: Date) {
  const {period} = data, limits = period.policy.capabilities[data.capability], total = D(data.allowance).times(data.maxAttempts);
  if (!limits || total.gt(limits.requestCap) || total.plus(period.spent).plus(period.reserved).gt(period.policy.periodCap))
    throw new AiExecutionError("AI_BUDGET_EXCEEDED", 429);
  const [used] = await tx.$queryRaw<Array<{amount: string}>>(Prisma.sql`SELECT COALESCE(SUM(charged+held),0)::text amount FROM "AiExecution" WHERE "tenantId"=${p.tenantId} AND "periodId"=${period.id} AND capability=${data.capability}`);
  if (total.plus(used.amount).gt(limits.periodCap)) throw new AiExecutionError("AI_CAPABILITY_BUDGET_EXCEEDED", 429);
  const type = `v2:${data.capability}`;
  await tx.$executeRaw(Prisma.sql`UPDATE "AgentRun" SET status='error',"errorMsg"='Agent run timed out before completion',"finishedAt"=${now} WHERE "tenantId"=${p.tenantId} AND "agentType"=${type} AND status='running' AND "startedAt"<${new Date(now.getTime()-AGENT_RUN_STALE_AFTER_MS)}`);
  const [running] = await tx.$queryRaw<Array<{id: string}>>(Prisma.sql`SELECT id FROM "AgentRun" WHERE "tenantId"=${p.tenantId} AND "agentType"=${type} AND status='running'`);
  if (running) throw new AiExecutionError("AGENT_RUN_ALREADY_RUNNING");
  const id = randomUUID(), runId = randomUUID();
  const metadata = {...data.metadata, policy: period.policy, allowance: data.allowance, maxAttempts: data.maxAttempts};
  await tx.$executeRaw(Prisma.sql`INSERT INTO "AgentRun" (id,"tenantId","agentType",status,input,"startedAt") VALUES (${runId},${p.tenantId},${type},'running',${JSON.stringify(metadata)}::jsonb,${now})`);
  await tx.$executeRaw(Prisma.sql`INSERT INTO "AiExecution" (id,"tenantId","periodId","runId","requestKey",fingerprint,capability,metadata,held) VALUES (${id},${p.tenantId},${period.id},${runId},${data.key},${data.fingerprint},${data.capability},${JSON.stringify(metadata)}::jsonb,${total.toFixed(8)})`);
  await tx.$executeRaw(Prisma.sql`UPDATE "AiBudgetPeriod" SET reserved=reserved+${total.toFixed(8)}::numeric WHERE id=${period.id} AND "tenantId"=${p.tenantId}`);
  return executionById(p, id, tx);
}
export async function beginAiAttempt(p: AiPrincipal, row: ExecutionRow, ordinal: number, tx: SqlClient, now: Date) {
  if (row.state !== "RUNNING" || ordinal < 1 || ordinal > row.metadata.maxAttempts || D(row.held).lt(row.metadata.allowance))
    throw new AiExecutionError("AI_ATTEMPT_NOT_ALLOWED");
  const [run] = await tx.$queryRaw<Array<{status: string}>>(Prisma.sql`SELECT status FROM "AgentRun" WHERE id=${row.runId} AND "tenantId"=${p.tenantId}`);
  if (run?.status !== "running") throw new AiExecutionError("AI_RUN_NOT_ACTIVE");
  const [active] = await tx.$queryRaw<Array<{id: string}>>(Prisma.sql`SELECT id FROM "AiBudgetPeriod" WHERE id=${row.periodId} AND "tenantId"=${p.tenantId} AND enabled AND "startsAt"<=${now} AND "endsAt">${now}`);
  if (!active) throw new AiExecutionError("AI_POLICY_REQUIRED");
  const id = randomUUID();
  await tx.$executeRaw(Prisma.sql`INSERT INTO "AiUsageAttempt" (id,"tenantId","executionId",ordinal,allowance) VALUES (${id},${p.tenantId},${row.id},${ordinal},${row.metadata.allowance}::numeric)`);
  return id;
}
/** Exact usage is priced; estimates/unknown outcomes retain the entire attempt allowance. Idempotent identical settlement. */
export async function settleAiAttempt(p: AiPrincipal, execution: ExecutionRow, attemptId: string, usage: TokenUsage | null, quality: "EXACT" | "ESTIMATED" | "UNKNOWN", requestId: string | null, tx: SqlClient, responseModel: string | null = null) {
  if (usage) validateUsage(usage);
  if (quality === "EXACT" && !usage) throw new AiExecutionError("AI_INVALID_USAGE", 400);
  const [attempt] = await tx.$queryRaw<Array<{state: string; allowance: string; charged: string | null; quality: string; usage: TokenUsage | null}>>(Prisma.sql`SELECT state,allowance::text,charged::text,quality,usage FROM "AiUsageAttempt" WHERE id=${attemptId} AND "executionId"=${execution.id} AND "tenantId"=${p.tenantId}`);
  if (!attempt) throw new AiExecutionError("AI_ATTEMPT_NOT_FOUND", 404);
  if (attempt.state === "SETTLED") {
    if (attempt.quality !== quality || payloadHash(attempt.usage) !== payloadHash(usage)) throw new AiExecutionError("AI_USAGE_CONFLICT");
    return attempt.charged!;
  }
  const charge = quality === "EXACT" ? usageCost(usage!, execution.metadata.policy) : attempt.allowance;
  await tx.$executeRaw(Prisma.sql`UPDATE "AiUsageAttempt" SET state='SETTLED',charged=${charge}::numeric,usage=${JSON.stringify(usage)}::jsonb,quality=${quality},"requestId"=${requestId?.slice(0,200) ?? null},"responseModel"=${responseModel?.slice(0,200) ?? null},"finishedAt"=now() WHERE id=${attemptId}`);
  await tx.$executeRaw(Prisma.sql`UPDATE "AiExecution" SET held=held-${attempt.allowance}::numeric,charged=charged+${charge}::numeric WHERE id=${execution.id} AND "tenantId"=${p.tenantId}`);
  await tx.$executeRaw(Prisma.sql`UPDATE "AiBudgetPeriod" SET reserved=reserved-${attempt.allowance}::numeric,spent=spent+${charge}::numeric WHERE id=${execution.periodId} AND "tenantId"=${p.tenantId}`);
  return charge;
}
export async function finishAiExecution(p: AiPrincipal, row: ExecutionRow, result: unknown, errorCode: string | null, tx: SqlClient) {
  if (row.state !== "RUNNING") throw new AiExecutionError("AI_EXECUTION_TERMINAL");
  const [pending] = await tx.$queryRaw<Array<{id: string}>>(Prisma.sql`SELECT id FROM "AiUsageAttempt" WHERE "executionId"=${row.id} AND "tenantId"=${p.tenantId} AND state='STARTED' LIMIT 1`);
  if (pending) throw new AiExecutionError("AI_USAGE_PENDING");
  await tx.$executeRaw(Prisma.sql`UPDATE "AiBudgetPeriod" SET reserved=reserved-${row.held}::numeric WHERE id=${row.periodId} AND "tenantId"=${p.tenantId}`);
  await tx.$executeRaw(Prisma.sql`UPDATE "AiExecution" SET state=${errorCode ? 'ERROR' : 'DONE'},held=0,result=${JSON.stringify(result)}::jsonb,"errorCode"=${errorCode},"finishedAt"=now() WHERE id=${row.id} AND "tenantId"=${p.tenantId}`);
  await tx.$executeRaw(Prisma.sql`UPDATE "AgentRun" SET status=${errorCode ? 'error' : 'done'},output=${JSON.stringify(result)}::jsonb,"errorMsg"=${errorCode},"finishedAt"=now() WHERE id=${row.runId} AND "tenantId"=${p.tenantId}`);
}
/** Explicit admin recovery: no network replay, no assumption that a timed-out provider call was free. */
export async function recoverAiExecution(p: AiPrincipal, executionId: string, evidenceRef: string, db: SqlDatabase = prisma, now = new Date()) {
  boundedText(evidenceRef);
  return aiTransaction(p, db, async tx => {
    let row = await executionById(p, executionId, tx);
    if (row.state !== "RUNNING") return;
    const [run] = await tx.$queryRaw<Array<{startedAt: Date}>>(Prisma.sql`SELECT "startedAt" FROM "AgentRun" WHERE id=${row.runId} AND "tenantId"=${p.tenantId}`);
    if (now.getTime()-run.startedAt.getTime() < AGENT_RUN_STALE_AFTER_MS) throw new AiExecutionError("AI_EXECUTION_NOT_STALE");
    const attempts = await tx.$queryRaw<Array<{id: string}>>(Prisma.sql`SELECT id FROM "AiUsageAttempt" WHERE "executionId"=${row.id} AND "tenantId"=${p.tenantId} AND state='STARTED' ORDER BY ordinal`);
    for (const attempt of attempts) await settleAiAttempt(p, row, attempt.id, null, "UNKNOWN", null, tx);
    row = await executionById(p, executionId, tx);
    await finishAiExecution(p, row, null, "AI_EXECUTION_RECOVERED", tx);
    await tx.$executeRaw(Prisma.sql`INSERT INTO "MerchandisingAction" (id,"tenantId","actorId",action,"entityType","entityId","idempotencyKey",before,after,context) VALUES (${randomUUID()},${p.tenantId},${p.userId},'AI_EXECUTION_RECOVERED','AI_EXECUTION',${row.id},${randomUUID()},'{}',${JSON.stringify({evidenceRef})}::jsonb,'{}')`);
  }, true);
}

/** A trusted operator may replace a conservative charge with verified provider usage; evidence is mandatory and replay is idempotent. */
export async function reconcileAiAttempt(p: AiPrincipal, executionId: string, attemptId: string, usage: TokenUsage,
  evidenceRef: string, db: SqlDatabase = prisma) {
  validateUsage(usage); boundedText(evidenceRef);
  return aiTransaction(p, db, async tx => {
    const execution = await executionById(p, executionId, tx);
    const [attempt] = await tx.$queryRaw<Array<{state: string; charged: string; quality: string; usage: TokenUsage | null}>>(Prisma.sql`SELECT state,charged::text,quality,usage FROM "AiUsageAttempt" WHERE id=${attemptId} AND "executionId"=${executionId} AND "tenantId"=${p.tenantId}`);
    if (!attempt || attempt.state !== "SETTLED") throw new AiExecutionError("AI_USAGE_PENDING");
    if (attempt.quality === "EXACT") {
      if (payloadHash(attempt.usage) !== payloadHash(usage)) throw new AiExecutionError("AI_USAGE_CONFLICT");
      return;
    }
    const charge = usageCost(usage, execution.metadata.policy), delta = D(charge).minus(attempt.charged).toFixed(8);
    await tx.$executeRaw(Prisma.sql`UPDATE "AiUsageAttempt" SET usage=${JSON.stringify(usage)}::jsonb,quality='EXACT',charged=${charge}::numeric WHERE id=${attemptId} AND "tenantId"=${p.tenantId}`);
    await tx.$executeRaw(Prisma.sql`UPDATE "AiExecution" SET charged=charged+${delta}::numeric WHERE id=${executionId} AND "tenantId"=${p.tenantId}`);
    await tx.$executeRaw(Prisma.sql`UPDATE "AiBudgetPeriod" SET spent=spent+${delta}::numeric WHERE id=${execution.periodId} AND "tenantId"=${p.tenantId}`);
    await tx.$executeRaw(Prisma.sql`INSERT INTO "MerchandisingAction" (id,"tenantId","actorId",action,"entityType","entityId","idempotencyKey",before,after,context) VALUES (${randomUUID()},${p.tenantId},${p.userId},'AI_USAGE_RECONCILED','AI_USAGE_ATTEMPT',${attemptId},${randomUUID()},${JSON.stringify({charged: attempt.charged, quality: attempt.quality, usage: attempt.usage})}::jsonb,${JSON.stringify({charged: charge, quality: 'EXACT', usage, evidenceRef})}::jsonb,'{}')`);
  }, true);
}
