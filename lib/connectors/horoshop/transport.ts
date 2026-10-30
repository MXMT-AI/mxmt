import "server-only";
import { lookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";
import { request } from "node:https";
import { ConnectorReadError } from "../read-error";
import { shopOrigin } from "./config";
const blocked = new BlockList();
for (const [address, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 3],
] as const)
  blocked.addSubnet(address, prefix, "ipv4");
const globalV6 = new BlockList();
globalV6.addSubnet("2000::", 3, "ipv6");
for (const [address, prefix] of [
  ["2001::", 23],
  ["2001:db8::", 32],
  ["2002::", 16],
  ["3fff::", 20],
] as const)
  blocked.addSubnet(address, prefix, "ipv6");
export function publicAddress(address: string) {
  const family = isIP(address);
  return family === 4
    ? !blocked.check(address, "ipv4")
    : family === 6 &&
        globalV6.check(address, "ipv6") &&
        !blocked.check(address, "ipv6");
}
export async function resolveShop(hostname: string, resolve = lookup) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const addresses = await Promise.race([
    resolve(hostname, { all: true, verbatim: true }),
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new ConnectorReadError("TIMEOUT")), 8000);
      timer.unref();
    }),
  ]).finally(() => clearTimeout(timer));
  if (!addresses.length || addresses.some((a) => !publicAddress(a.address)))
    throw new ConnectorReadError("NOT_CONFIGURED");
  return addresses[0];
}
export async function horoshopFetch(
  url: URL,
  init: RequestInit,
): Promise<Response> {
  const allowed = (process.env.HOROSHOP_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (
    !shopOrigin(url.origin) ||
    !allowed.includes(url.origin) ||
    url.search ||
    url.hash ||
    url.username ||
    url.password ||
    init.method !== "POST" ||
    ![
      "/api/auth/",
      "/api/orders/get/",
      "/api/orders/get_available_statuses/",
      "/api/catalog/export/",
    ].includes(url.pathname) ||
    typeof init.body !== "string"
  )
    throw new ConnectorReadError("NOT_CONFIGURED");
  const pinned = await resolveShop(url.hostname);
  return new Promise((resolve, reject) => {
    const req = request(
      url,
      {
        method: "POST",
        agent: false,
        signal: init.signal ?? AbortSignal.timeout(8000),
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        lookup: ((_host: unknown, _opts: unknown, cb: any) =>
          _opts && typeof _opts === "object" && "all" in _opts && _opts.all
            ? cb(null, [pinned])
            : cb(null, pinned.address, pinned.family)) as any,
      },
      (res) => {
        const chunks: Buffer[] = [];
        let size = 0;
        res.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > 4 * 1024 * 1024) {
            req.destroy();
            reject(new ConnectorReadError("RESPONSE_TOO_LARGE"));
          } else chunks.push(chunk);
        });
        res.on("error", () => reject(new ConnectorReadError("NETWORK_ERROR")));
        res.on("end", () => {
          try {
            resolve(
              new Response(Buffer.concat(chunks), {
                status: res.statusCode ?? 502,
                headers: {
                  "Retry-After": String(res.headers["retry-after"] ?? ""),
                },
              }),
            );
          } catch {
            reject(new ConnectorReadError("INVALID_RESPONSE"));
          }
        });
      },
    );
    req.on("error", () =>
      reject(
        new ConnectorReadError(
          init.signal?.aborted ? "TIMEOUT" : "NETWORK_ERROR",
        ),
      ),
    );
    req.end(init.body);
  });
}
