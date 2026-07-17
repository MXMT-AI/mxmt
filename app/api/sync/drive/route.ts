import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { syncFromDrive, isDriveConfigured, getDriveMode } from "@/lib/gdrive";
import { requireApiUser } from "@/lib/server-auth";
import { apiError, serverError } from "@/lib/api-contracts";

export async function POST() {
  const { user, response } = await requireApiUser("ADMIN");
  if (response) return response;
  const { tenantId } = user;

  if (!isDriveConfigured()) {
    return apiError(
      "Google Drive not configured. Set GOOGLE_DRIVE_FILE_ID (and optionally GOOGLE_SERVICE_ACCOUNT_KEY).",
      400,
      "DRIVE_NOT_CONFIGURED"
    );
  }

  const fileId = process.env.GOOGLE_DRIVE_FILE_ID!;
  const mode = getDriveMode();

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
    const result = await syncFromDrive(tenantId);
    const total = result.skus + result.inventory + result.sales;

    // If 0 records imported — mark as warning, not success
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
