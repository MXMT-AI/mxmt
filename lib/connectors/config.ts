import { isRecord, stringField } from "@/lib/api-contracts";

export interface SalesDriveCredentials {
  accountHost: string;
  ordersApiKey: string;
  receiptsApiKey: string | null;
  ymlUrl: string | null;
}

/** Accept only SalesDrive-controlled HTTPS origins; credentials never cross redirects. */
export function salesDriveHost(value: string): string | null {
  return /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.salesdrive\.me$/.test(value) ? value : null;
}

/** The feed token is confidential and must remain inside encrypted credentials. */
export function salesDriveYmlUrl(value: string, accountHost: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.hostname !== accountHost || url.port || url.username || url.password || url.hash
      || url.pathname !== "/export/yml/export.yml" || !url.searchParams.get("publicKey")) return null;
    return url.href;
  } catch { return null; }
}

/** Validate field names without echoing submitted keys, URLs or arbitrary values. */
export function parseSalesDriveCredentials(input: unknown): { credentials: SalesDriveCredentials | null; issues: string[] } {
  const issues: string[] = [];
  if (!isRecord(input)) return { credentials: null, issues: ["body must be an object"] };
  if (Object.keys(input).some((key) => !["accountHost", "ordersApiKey", "receiptsApiKey", "ymlUrl"].includes(key))) {
    issues.push("Unexpected configuration fields");
  }
  const accountHost = stringField(input, "accountHost", issues, { required: true, maxLength: 100 }) ?? "";
  const ordersApiKey = stringField(input, "ordersApiKey", issues, { required: true, maxLength: 512 }) ?? "";
  const receiptsApiKey = stringField(input, "receiptsApiKey", issues, { maxLength: 512 }) || null;
  const ymlUrl = stringField(input, "ymlUrl", issues, { maxLength: 2048 }) || null;
  if (!salesDriveHost(accountHost)) issues.push("accountHost must be a SalesDrive account hostname");
  for (const key of [ordersApiKey, receiptsApiKey]) {
    if (key && /[\s\x00-\x1f\x7f]/.test(key)) issues.push("API keys must not contain whitespace or control characters");
    if (key && /[^\x00-\xff]/.test(key)) issues.push("API keys must contain only HTTP header-compatible characters");
  }
  if (ymlUrl && !salesDriveYmlUrl(ymlUrl, accountHost)) issues.push("ymlUrl must be an HTTPS SalesDrive export link for this account with a publicKey");
  return { credentials: issues.length ? null : { accountHost, ordersApiKey, receiptsApiKey, ymlUrl }, issues };
}
