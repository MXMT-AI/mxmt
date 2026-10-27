import type { PublicConnection } from "./contract";
const record = (v: unknown): v is Record<string, unknown> =>
  Boolean(v) && typeof v === "object" && !Array.isArray(v);
const optionalText = (v: unknown) => v === null || typeof v === "string";
/** Reject proxy/empty/malformed successful JSON before it enters connection UI state. */
export function isPublicConnection(v: unknown): v is PublicConnection {
  if (
    !record(v) ||
    typeof v.configured !== "boolean" ||
    !optionalText(v.accountHost) ||
    typeof v.hasReceiptsKey !== "boolean" ||
    typeof v.hasYmlUrl !== "boolean" ||
    !(
      v.revision === null ||
      (typeof v.revision === "number" &&
        Number.isSafeInteger(v.revision) &&
        v.revision > 0)
    )
  )
    return false;
  if (v.lastCheck === null) return true;
  const c = v.lastCheck;
  if (
    !record(c) ||
    typeof c.ok !== "boolean" ||
    typeof c.checkedAt !== "string" ||
    !Number.isFinite(Date.parse(c.checkedAt)) ||
    !Array.isArray(c.checks) ||
    c.checks.some(
      (r) =>
        !record(r) ||
        typeof r.resource !== "string" ||
        typeof r.code !== "string",
    )
  )
    return false;
  if (c.metadata !== undefined) {
    const m = c.metadata;
    if (
      !record(m) ||
      ![m.apiVersion, m.shopId, m.appId, m.timezone].every(
        (s) => typeof s === "string" && s.length > 0 && s.length <= 200,
      ) ||
      !Array.isArray(m.scopes) ||
      m.scopes.length > 200 ||
      m.scopes.some((s) => typeof s !== "string" || !/^\w{1,100}$/.test(s))
    )
      return false;
  }
  return ["statuses", "channels"].every((k) => {
    const d = c[k];
    return (
      record(d) &&
      typeof d.complete === "boolean" &&
      optionalText(d.reason) &&
      Array.isArray(d.entries) &&
      d.entries.every(
        (e) =>
          record(e) && typeof e.id === "string" && typeof e.name === "string",
      )
    );
  });
}
