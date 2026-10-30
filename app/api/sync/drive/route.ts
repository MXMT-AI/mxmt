import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { syncFromDrive, getDriveMode } from "@/lib/gdrive";
import { DriveConnectionError, requireDriveConnection } from "@/lib/drive-connection";
import { requireApiUser } from "@/lib/server-auth";
import { apiError, serverError } from "@/lib/api-contracts";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST() {
  const { user, response } = await requireApiUser("ADMIN");
  if (response) return response;
  const { tenantId } = user;

  let fileId: string;
  try { fileId = (await requireDriveConnection(tenantId)).fileId; }
  catch (error) {
    if (error instanceof DriveConnectionError)
      return apiError("Connect Google Sheets for this cabinet in Settings.", error.status, error.code);
    return serverError("Could not read Google Sheets connection");
  }
  const mode = getDriveMode(fileId);

  let syncRecord = await prisma.googleDriveSync.findFirst({ where: { tenantId } });
  if (!syncRecord) {
    syncRecord = await prisma.googleDriveSync.create({
      data: { tenantId, driveFileId: fileId, syncStatus: "running" },
    });
  } else {
    await prisma.googleDriveSync.update({
      where: { id: syncRecord.id },
      data: { syncStatus: "running", errorMessage: null },
    });
  }

  const id = syncRecord.id;

  try {
    const result = await syncFromDrive(tenantId, fileId);
    const total = result.skus + result.inventory + result.sales;

    const status = result.warning ? "error" : "success";
    const errorMessage = result.warning ?? null;

    await prisma.googleDriveSync.update({
      where: { id },
      data: { syncStatus: status, lastSyncAt: new Date(), driveFileId: fileId, errorMessage },
    });

    return NextResponse.json({ ok: total > 0, mode, ...result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    await prisma.googleDriveSync.update({
      where: { id },
      data: { syncStatus: "error", errorMessage: msg },
    });
    return serverError(msg);
  }
}
