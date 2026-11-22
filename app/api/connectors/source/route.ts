import { NextRequest, NextResponse } from "next/server";
import { apiError, isRecord, parseJsonBody } from "@/lib/api-contracts";
import { requireApiUser } from "@/lib/server-auth";
import { withRequestId } from "@/lib/observability";
import {
  listConnectorSources,
  selectConnectorSource,
  ConnectorSourceError,
} from "@/lib/connectors/source";
import { apiConnectorsSourceRouteMessages as englishCopy } from "@/messages/en.json";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
async function handle(request: NextRequest, write: boolean) {
  const requestId = crypto.randomUUID();
  const respond = (r: NextResponse) => {
    r.headers.set("Cache-Control", "no-store");
    return withRequestId(r, requestId);
  };
  const { user, response } = await requireApiUser(
    write ? "ADMIN" : undefined,
    requestId,
  );
  if (response) return respond(response);
  try {
    if (write) {
      const body = await parseJsonBody(request, requestId, 2048);
      if (body.response) return respond(body.response);
      const value = body.data;
      if (
        !isRecord(value) ||
        Object.keys(value).some((k) => !["sourceId", "revision"].includes(k)) ||
        typeof value.sourceId !== "string" ||
        typeof value.revision !== "number"
      )
        return respond(
          apiError(
            englishCopy.chooseASavedSourceAnd,
            400,
            "INVALID_SOURCE_SELECTION",
            undefined,
            requestId,
          ),
        );
      await selectConnectorSource(
        user.tenantId,
        user.userId,
        value.sourceId,
        value.revision,
      );
    }
    return respond(
      NextResponse.json(await listConnectorSources(user.tenantId)),
    );
  } catch (error) {
    const known = error instanceof ConnectorSourceError;
    return respond(
      apiError(
        known
          ? englishCopy.sourceSelectionCouldNotBe
          : englishCopy.sourcesAreUnavailableRetry,
        known ? error.status : 503,
        known ? error.code : "CONNECTOR_SOURCES_UNAVAILABLE",
        undefined,
        requestId,
      ),
    );
  }
}
export const GET = (request: NextRequest) => handle(request, false);
export const POST = (request: NextRequest) => handle(request, true);
