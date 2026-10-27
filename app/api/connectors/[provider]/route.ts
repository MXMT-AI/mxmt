import { NextRequest } from "next/server";
import { apiError } from "@/lib/api-contracts";
import { connectionHandlers } from "@/lib/connectors/connection-route";
import { isSourceProvider } from "@/lib/connectors/source";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
type Context = { params: Promise<{ provider: string }> };
async function handle(
  request: NextRequest,
  context: Context,
  method: "GET" | "PUT" | "POST",
) {
  const { provider } = await context.params;
  if (!isSourceProvider(provider)) {
    const response = apiError(
      "Unknown connector",
      404,
      "CONNECTOR_PROVIDER_NOT_FOUND",
    );
    response.headers.set("Cache-Control", "no-store");
    return response;
  }
  return connectionHandlers(provider)[method](request);
}
export const GET = (request: NextRequest, context: Context) =>
  handle(request, context, "GET");
export const PUT = (request: NextRequest, context: Context) =>
  handle(request, context, "PUT");
export const POST = (request: NextRequest, context: Context) =>
  handle(request, context, "POST");
