import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createSpreadsheet } from "@/lib/gsheets";
import { requireApiUser } from "@/lib/server-auth";

// Універсальний експорт 2D-масиву в нову Google-таблицю.

export async function POST(req: NextRequest) {
  const { user: currentUser, response } = await requireApiUser();
  if (response) return response;
  const { tenantId, userId } = currentUser;

  const body = await req.json().catch(() => ({}));
  const title: string | undefined = body.title;
  const values: (string | number)[][] | undefined = body.values;

  if (!title || !Array.isArray(values) || values.length === 0) {
    return NextResponse.json({ error: "Потрібні title і values" }, { status: 400 });
  }

  try {
    // email користувача — щоб розшарити файл, якщо експорт-папка не налаштована
    let email: string | null = null;
    if (userId) {
      const user = await prisma.user.findFirst({
        where: { id: userId, tenantId },
        select: { email: true },
      });
      email = user?.email ?? null;
    }

    const sheet = await createSpreadsheet(title, values, email, body.sheetName ?? "Sheet1");
    return NextResponse.json(sheet);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
