import "server-only";
import { createHash } from "node:crypto";
import { KeyCrmConnector } from "./keycrm/adapter";
import { parseKeyCrmConfig, keyCrmMapping } from "./keycrm/config";
import { CsvConnector, parseCsvConfig } from "./csv/adapter";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { RequestWindow } from "./budget";
import { graphqlBudgetedFetcher, type QueryCostPolicy } from "./query-cost";
import { decryptCredentials } from "./secrets";
import { SalesDriveConnector } from "./salesdrive";
import { parseSalesDriveCredentials } from "./config";
import { budgetedFetcher } from "./budget";
import {
  selectedConnection,
  isSourceProvider,
  type SourceProvider,
} from "./source";
import type { MerchandisingConnector } from "./contract";
import type { SqlDatabase } from "./database";
export interface ProviderRegistration {
  sourceMapping?(credentials:any):{revision:number;reference:string;values:unknown};
  transport?: "http" | "offline";
  requestWindows?: ReadonlyArray<RequestWindow>;
  queryCost?: QueryCostPolicy;
  budgetIdentity?(credentials: any): string;
  parse(
    value: unknown,
  ):
    | { credentials: unknown; issues: string[] }
    | { credentials: null; issues: string[] };
  identity(credentials: any): {
    accountHost: string;
    sourceKey: string;
    timezone: string;
    hasYmlUrl: boolean;
    hasReceiptsKey: boolean;
  };
  create(
    credentials: any,
    fetcher: (url: URL, init: RequestInit) => Promise<Response>,
    timezone: string,
  ): MerchandisingConnector;
}
/** Static code registrations; never mutate a process-wide tenant/credential registry. Provider slices add entries here. */
export const PROVIDER_ADAPTERS: Readonly<
  Partial<Record<SourceProvider, ProviderRegistration>>
> = Object.freeze({
  keycrm:{parse:parseKeyCrmConfig,identity:c=>({accountHost:c.accountId,sourceKey:c.accountId,timezone:c.timezone,hasYmlUrl:false,hasReceiptsKey:false}),requestWindows:[{milliseconds:60000,limit:20}],budgetIdentity:c=>createHash("sha256").update(c.apiKey).digest("hex"),sourceMapping:keyCrmMapping,create:(c,f)=>new KeyCrmConnector(c,f)},
  csv: {transport:"offline",parse:parseCsvConfig,identity:c=>({accountHost:"CSV upload",sourceKey:"manual",timezone:c.timezone,hasYmlUrl:false,hasReceiptsKey:false}),create:()=>new CsvConnector()},
  salesdrive: {
    parse: parseSalesDriveCredentials,
    identity: (c) => ({
      accountHost: c.accountHost,
      sourceKey: c.accountHost,
      timezone: "Europe/Kyiv",
      hasYmlUrl: Boolean(c.ymlUrl),
      hasReceiptsKey: Boolean(c.receiptsApiKey),
    }),
    create: (c, fetcher, timezone) =>
      new SalesDriveConnector(c, fetcher, timezone),
  },
});
export async function loadConnectorRuntime(
  tenantId: string,
  backfill = false,
  db: SqlDatabase = prisma,
  registrations = PROVIDER_ADAPTERS,
  expectedSourceId?: string,
) {
  const [row] = await db.$queryRaw<
    Array<{
      sourceId: string;
      revision: number;
      provider: string;
      accountHost: string;
      encryptedConfig: string;
      timezone: string;
    }>
  >(Prisma.sql`
    SELECT c.*,s.timezone FROM "ConnectorConnection" c JOIN "DataSource" s ON s.id=c."sourceId" AND s."tenantId"=c."tenantId"
    WHERE c."tenantId"=${tenantId} AND ${expectedSourceId ? Prisma.sql`c."sourceId"=${expectedSourceId}` : selectedConnection()} AND s.kind::text=upper(c.provider)`);
  if (!row || !isSourceProvider(row.provider))
    throw new Error("NOT_CONFIGURED");
  const connector = createProviderConnector(
    row.encryptedConfig,
    tenantId,
    row.provider,
    row.timezone,
    db,
    backfill,
    registrations,
  );
  return {
    sourceId: row.sourceId,
    revision: row.revision,
    timezone: row.timezone,
    connector,
  };
}

export function createProviderConnector(
  encrypted: string,
  tenantId: string,
  provider: SourceProvider,
  timezone: string,
  db: SqlDatabase = prisma,
  backfill = false,
  registrations = PROVIDER_ADAPTERS,
) {
  const registration = registrations[provider];
  if (!registration) throw new Error("CONNECTOR_PROVIDER_UNAVAILABLE");
  const parsed = registration.parse(
    decryptCredentials(encrypted, tenantId, provider),
  );
  if (!parsed.credentials) throw new Error("CONNECTOR_STORAGE_UNAVAILABLE");
  const identity = registration.identity(parsed.credentials);
  if (
    registration.transport !== "offline" &&
    provider !== "salesdrive" &&
    !registration.requestWindows?.length &&
    !registration.queryCost
  )
    throw new Error("CONNECTOR_BUDGET_UNVERIFIED");
  const budgetIdentity =
    registration.budgetIdentity?.(parsed.credentials) ?? identity.sourceKey;
  const request =
    registration.transport === "offline"
      ? async () => {
          throw new Error("NOT_CONFIGURED");
        }
      : provider === "salesdrive"
        ? budgetedFetcher(identity.accountHost, db, undefined, backfill)
        : budgetedFetcher(
            `${provider}:${budgetIdentity}`,
            db,
            undefined,
            backfill,
            registration.requestWindows ?? [],
          );
  const fetcher = registration.queryCost
    ? graphqlBudgetedFetcher(
        `${provider}:${budgetIdentity}`,
        db,
        request,
        registration.queryCost,
        backfill,
      )
    : request;
  const connector = registration.create(parsed.credentials, fetcher, timezone);
  if (connector.provider !== provider)
    throw new Error("CONNECTOR_CONFIG_CHANGED");
  return connector;
}
