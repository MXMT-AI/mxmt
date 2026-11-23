import { retryAfter } from "./budget";
import type { ConnectionCheck } from "./contract";
import { ConnectorReadError } from "./read-error";

export async function readConnectorResponse(request: () => Promise<Response>) {
  let response: Response;
  try {
    response = await request();
  } catch (error) {
    if (error instanceof ConnectorReadError) throw error;
    throw new ConnectorReadError(
      error instanceof Error && ["AbortError", "TimeoutError"].includes(error.name)
        ? "TIMEOUT"
        : "NETWORK_ERROR",
    );
  }

  if (response.ok) return response;
  await response.body?.cancel().catch(() => undefined);
  if (response.status === 401 || response.status === 403) {
    throw new ConnectorReadError("AUTH_FAILED");
  }
  if (response.status === 429) {
    throw new ConnectorReadError("RATE_LIMITED", retryAfter(response.headers.get("Retry-After")));
  }
  throw new ConnectorReadError("NETWORK_ERROR");
}

export function recordConnectionChecks(checks: ConnectionCheck["checks"]) {
  return async (
    resource: ConnectionCheck["checks"][number]["resource"],
    read: () => Promise<unknown>,
  ) => {
    try {
      await read();
      checks.push({ resource, code: "OK" });
    } catch (error) {
      checks.push({
        resource,
        code: error instanceof ConnectorReadError ? error.code : "NETWORK_ERROR",
      });
    }
  };
}
