import { NextRequest, NextResponse } from "next/server";
import { apiError, parseJsonBody, validationError } from "@/lib/api-contracts";
import { requireApiUser } from "@/lib/server-auth";
import {
  createRequestContext,
  logWarn,
  withRequestId,
} from "@/lib/observability";
import { PROVIDER_ADAPTERS } from "./runtime";
import type { SourceProvider } from "./source";
import {
  checkProviderConnection,
  getProviderConnection,
  saveProviderConnection,
} from "./service";

export function connectionHandlers(provider: SourceProvider) {
  async function handle(
    request: NextRequest,
    action: "get" | "save" | "check",
  ) {
    const context = createRequestContext(
      request,
      `/api/connectors/${provider}`,
    );
    // Never use a caller-supplied request ID as a log channel for submitted secrets.
    context.requestId = crypto.randomUUID();
    const respond = <T>(response: NextResponse<T>) => {
      response.headers.set("Cache-Control", "no-store");
      return withRequestId(response, context.requestId);
    };
    const { user, response } = await requireApiUser(
      action === "get" ? undefined : "ADMIN",
      context.requestId,
    );
    if (response) return respond(response);
    try {
      if (action === "get")
        return respond(
          NextResponse.json(
            await getProviderConnection(user.tenantId, provider),
          ),
        );
      if (action === "save") {
        const parsed = await parseJsonBody(request, context.requestId, 16_384);
        if (parsed.response) return respond(parsed.response);
        const registration = PROVIDER_ADAPTERS[provider];
        if (!registration)
          return respond(
            apiError(
              "This connector adapter is not installed",
              409,
              "CONNECTOR_PROVIDER_UNAVAILABLE",
              undefined,
              context.requestId,
            ),
          );
        const config = registration.parse(parsed.data);
        if (!config.credentials)
          return respond(validationError(config.issues, context.requestId));
        return respond(
          NextResponse.json(
            await saveProviderConnection(
              user.tenantId,
              config.credentials,
              provider,
            ),
          ),
        );
      }
      const result = await checkProviderConnection(user.tenantId, provider);
      if (!result)
        return respond(
          apiError(
            "Save a connection before checking it",
            409,
            "CONNECTOR_NOT_CONFIGURED",
            undefined,
            context.requestId,
          ),
        );
      return respond(NextResponse.json(result));
    } catch (error) {
      const changed =
        error instanceof Error && error.message === "CONNECTOR_CONFIG_CHANGED";
      const unavailable =
        error instanceof Error &&
        error.message === "CONNECTOR_STORAGE_UNAVAILABLE";
      const code = changed
        ? "CONNECTOR_CONFIG_CHANGED"
        : unavailable
          ? "CONNECTOR_STORAGE_UNAVAILABLE"
          : "CONNECTOR_REQUEST_FAILED";
      // Prisma/fetch errors may contain arguments or URLs: never serialize them here.
      logWarn("Connector operation failed", {
        requestId: context.requestId,
        code,
      });
      return respond(
        apiError(
          changed
            ? "Configuration changed; check the saved connection again"
            : unavailable
              ? "Secure credential storage is unavailable; contact your administrator"
              : "Connection operation failed; retry or contact your administrator",
          changed ? 409 : 503,
          code,
          undefined,
          context.requestId,
        ),
      );
    }
  }

  /** Return public connection status only; credentials are never selected for this response. */
  async function GET(request: NextRequest) {
    return handle(request, "get");
  }
  /** Replace write-only connection credentials for the authenticated tenant. */
  async function PUT(request: NextRequest) {
    return handle(request, "save");
  }
  /** Check read scopes without importing data or accepting target URLs from the request. */
  async function POST(request: NextRequest) {
    return handle(request, "check");
  }

  return { GET, PUT, POST };
}
