import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { apiError, isRecord, parseJsonBody } from "@/lib/api-contracts";
import { requireApiUser } from "@/lib/server-auth";
import { withRequestId } from "@/lib/observability";

/** Share the tenant/RBAC, bounded-input and sanitized-error boundary for connector import controls. */
export function importHandlers(config: { read: (tenantId: string) => Promise<unknown>; actions: Record<string, (tenantId: string) => Promise<unknown>>; knownErrors: string[] }) {
  /** Authenticate the tenant, validate write actions and return uncached progress. */
  async function handle(request: NextRequest, read: boolean) {
    const requestId = crypto.randomUUID();
    const respond = (response: NextResponse) => { response.headers.set("Cache-Control", "no-store"); return withRequestId(response, requestId); };
    const { user, response } = await requireApiUser(read ? undefined : "ADMIN", requestId);
    if (response) return respond(response);
    try {
      if (!read) {
        const body = await parseJsonBody(request, requestId, 2048);
        if (body.response) return respond(body.response);
        const action = isRecord(body.data) ? body.data.action : null;
        if (typeof action !== "string" || !Object.hasOwn(config.actions, action)) return respond(apiError("Choose a supported import action",400,"INVALID_ACTION",undefined,requestId));
        await config.actions[action](user.tenantId);
      }
      return respond(NextResponse.json(await config.read(user.tenantId)));
    } catch (error) {
      const code = error instanceof Error && config.knownErrors.includes(error.message) ? error.message : "IMPORT_UNAVAILABLE";
      return respond(apiError("Import is unavailable; check the connection and source mapping", code === "IMPORT_UNAVAILABLE" ? 503 : 409, code, undefined, requestId));
    }
  }
  return { GET: (request: NextRequest) => handle(request,true), POST: (request: NextRequest) => handle(request,false) };
}
