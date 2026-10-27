import { NextRequest, NextResponse } from "next/server";
import { apiError, parseJsonBody, isRecord } from "@/lib/api-contracts";
import { requireApiUser } from "@/lib/server-auth";
import { withRequestId } from "@/lib/observability";
import {
  csvImportAction,
  listCsvImports,
  previewCsv,
  readCsvImport,
  readCsvFiles,
  CsvStoreError,
} from "./store";
import { CsvError } from "./parser";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { processCsvJob } from "./worker";
export async function csvHttp(request: NextRequest, id?: string) {
  const requestId = crypto.randomUUID(),
    respond = (r: NextResponse) => {
      r.headers.set("Cache-Control", "no-store");
      r.headers.set("X-Content-Type-Options", "nosniff");
      return withRequestId(r, requestId);
    };
  const { user, response } = await requireApiUser("ADMIN", requestId);
  if (response) return respond(response);
  try {
    if (request.method === "GET") {
      if (!id)
        return respond(NextResponse.json(await listCsvImports(user.tenantId)));
      const upload = await readCsvImport(user.tenantId, id);
      const file = request.nextUrl.searchParams.get("file");
      if (file) {
        if (upload.state !== "ACTIVE" && upload.expiresAt < new Date())
          throw new CsvStoreError("CSV_EXPIRED", 410);
        const found = (await readCsvFiles(upload, prisma)).find(
          (f) => f.resource === file,
        );
        if (!found) throw new CsvStoreError("CSV_NOT_FOUND", 404);
        return respond(
          new NextResponse(Buffer.from(found.bytes, "base64"), {
            headers: {
              "Content-Type": "text/csv; charset=utf-8",
              "Content-Disposition": `attachment; filename="${found.resource}.csv"`,
            },
          }),
        );
      }
      const [job] = await prisma.$queryRaw<
        Array<{
          id: string;
          state: string;
          stats: unknown;
          errorCode: string | null;
        }>
      >(
        Prisma.sql`SELECT id,state,stats,"errorCode" FROM "ConnectorSyncJob" WHERE "tenantId"=${user.tenantId} AND "sourceId"=${upload.sourceId} AND "importRunId"=${upload.importRunId}`,
      );
      return respond(
        NextResponse.json({
          id: upload.id,
          sourceId: upload.sourceId,
          contentHash: upload.contentHash,
          state: upload.state,
          preview: upload.preview,
          options: upload.options,
          mappings: (await readCsvFiles(upload, prisma)).map(
            ({ resource, delimiter, columns }) => ({
              resource,
              delimiter,
              columns,
            }),
          ),
          expiresAt: upload.expiresAt,
          job: job ?? null,
        }),
      );
    }
    const parsed = await parseJsonBody(request, requestId, id ? 2048 : 1500000);
    if (parsed.response) return respond(parsed.response);
    const body = parsed.data;
    if (!isRecord(body)) throw new CsvError("INVALID_BODY");
    if (!id) {
      if (
        Object.keys(body).some(
          (k) => !["sourceId", "options", "files"].includes(k),
        ) ||
        (body.sourceId !== null && typeof body.sourceId !== "string")
      )
        throw new CsvError("INVALID_BODY");
      const row = await previewCsv(
        user.tenantId,
        user.userId,
        body.sourceId as string | null,
        body.options,
        body.files,
      );
      return respond(
        NextResponse.json({
          id: row.id,
          sourceId: row.sourceId,
          contentHash: row.contentHash,
          state: row.state,
          preview: row.preview,
          options: row.options,
          mappings: (await readCsvFiles(row, prisma)).map(
            ({ resource, delimiter, columns }) => ({
              resource,
              delimiter,
              columns,
            }),
          ),
          expiresAt: row.expiresAt,
        }),
      );
    }
    if (
      Object.keys(body).some((k) => !["action", "hash"].includes(k)) ||
      typeof body.hash !== "string" ||
      !/^[a-f0-9]{64}$/.test(body.hash) ||
      !["activate", "cancel", "retry", "process"].includes(String(body.action))
    )
      throw new CsvError("INVALID_BODY");
    if (body.action === "process") {
      const row = await readCsvImport(user.tenantId, id);
      if (row.contentHash !== body.hash)
        throw new CsvStoreError("CSV_HASH_CHANGED");
      const [job] = await prisma.$queryRaw<Array<{ id: string }>>(
        Prisma.sql`SELECT id FROM "ConnectorSyncJob" WHERE "tenantId"=${user.tenantId} AND "sourceId"=${row.sourceId} AND "importRunId"=${row.importRunId} AND resource='csv'`,
      );
      if (!job) throw new CsvStoreError("CSV_NOT_READY");
      await processCsvJob(user.tenantId, prisma, undefined, job.id);
      return respond(NextResponse.json({ processed: true }));
    }
    return respond(
      NextResponse.json(
        await csvImportAction(
          user.tenantId,
          user.userId,
          id,
          body.hash,
          body.action as "activate" | "cancel" | "retry",
        ),
      ),
    );
  } catch (e) {
    const code =
      e instanceof CsvStoreError || e instanceof CsvError
        ? e.code
        : e instanceof Error &&
            ["INVALID_SOURCE_MAPPING", "INVALID_CONNECTOR_CONFIG"].includes(
              e.message,
            )
          ? "INVALID_OPTIONS"
          : "CSV_OPERATION_FAILED";
    return respond(
      apiError(
        code,
        e instanceof CsvStoreError
          ? e.status
          : e instanceof CsvError || code === "INVALID_OPTIONS"
            ? 400
            : 503,
        code,
        undefined,
        requestId,
      ),
    );
  }
}
