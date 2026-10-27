import "server-only";
import type {
  MerchandisingConnector,
  ConnectorCapabilities,
  PageRequest,
  ConnectorPage,
  ConnectionCheck,
} from "../contract";
import type { CsvBundle } from "./compile";
import { ConnectorReadError } from "../read-error";
import { isRecord } from "@/lib/api-contracts";
/** Offline metadata configuration; uploads are frozen separately, never in credential envelopes. */
export function parseCsvConfig(v: unknown) {
  const valid =
    isRecord(v) &&
    Object.keys(v).every((k) => ["timezone"].includes(k)) &&
    typeof v.timezone === "string" &&
    v.timezone.length <= 100;
  if (!valid) return { credentials: null, issues: ["INVALID_CSV_CONFIG"] };
  try {
    Intl.DateTimeFormat("en", { timeZone: v.timezone as string });
  } catch {
    return { credentials: null, issues: ["INVALID_TIMEZONE"] };
  }
  return { credentials: { timezone: v.timezone as string }, issues: [] };
}
export class CsvConnector implements MerchandisingConnector {
  readonly provider = "csv" as const;
  readonly capabilities: ConnectorCapabilities;
  constructor(private bundle?: CsvBundle) {
    this.capabilities = {
      orders: Boolean(bundle),
      products: Boolean(bundle?.catalogs.length),
      stock: Boolean(bundle?.catalogs.length),
      receipts: Boolean(bundle?.receipts.length),
      statuses: Boolean(bundle?.statuses.entries.length),
      channels: bundle?.channels.entries.length ? "metadata" : "unavailable",
      incrementalOrders: false,
      incrementalReceipts: false,
      historicalStock: false,
      writes: false,
      automaticSync: false,
    };
  }
  private page<T>(
    records: T[],
    request: PageRequest = {},
    observedAt = "1970-01-01T00:00:00.000Z",
  ): ConnectorPage<T> {
    if (!this.bundle) throw new ConnectorReadError("NOT_CONFIGURED");
    const page = request.page ?? 1,
      limit = request.limit ?? 100;
    if (
      !Number.isSafeInteger(page) ||
      page < 1 ||
      !Number.isSafeInteger(limit) ||
      limit < 1 ||
      limit > 100
    )
      throw new ConnectorReadError("INVALID_RESPONSE");
    const offset = (page - 1) * limit;
    return {
      records: records.slice(offset, offset + limit),
      nextPage: offset + limit < records.length ? page + 1 : null,
      observedAt,
    };
  }
  async getOrders(r?: PageRequest) {
    return this.page(
      this.bundle?.orders ?? [],
      r,
      this.bundle?.orders.at(-1)?.observedAt,
    );
  }
  async getReceipts(r?: PageRequest) {
    return this.page(
      this.bundle?.receipts ?? [],
      r,
      this.bundle?.receipts.at(-1)?.observedAt,
    );
  }
  async getProducts(r?: PageRequest) {
    return this.page(
      this.bundle?.catalogs.at(-1)?.products ?? [],
      r,
      this.bundle?.catalogs.at(-1)?.observedAt,
    );
  }
  async getStock(r?: PageRequest) {
    return this.page(
      this.bundle?.catalogs.at(-1)?.stock ?? [],
      r,
      this.bundle?.catalogs.at(-1)?.observedAt,
    );
  }
  async getStatuses() {
    return (
      this.bundle?.statuses ?? {
        entries: [],
        complete: false,
        reason: "NOT_UPLOADED",
      }
    );
  }
  async getChannels() {
    return (
      this.bundle?.channels ?? {
        entries: [],
        complete: false,
        reason: "NOT_UPLOADED",
      }
    );
  }
  async checkConnection(): Promise<ConnectionCheck> {
    return {
      ok: true,
      checkedAt: new Date().toISOString(),
      checks: [],
      statuses: await this.getStatuses(),
      channels: await this.getChannels(),
    };
  }
}
