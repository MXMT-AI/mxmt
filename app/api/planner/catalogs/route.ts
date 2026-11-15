import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiUser } from "@/lib/server-auth";

export async function GET() {
  const { user, response } = await requireApiUser();
  if (response) return response;
  const catalogs = await prisma.catalogUpload.findMany({
    where: { tenantId: user.tenantId },
    select: {
      id: true, brandId: true, season: true, itemCount: true, uploadedAt: true,
      brand: { select: { name: true } },
    },
    orderBy: { uploadedAt: "desc" },
  });
  return NextResponse.json(catalogs);
}
