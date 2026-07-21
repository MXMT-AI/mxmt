import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createSpreadsheet } from "@/lib/gsheets";
import { requireApiUser } from "@/lib/server-auth";
import { isRecord, parseJsonBody, serverError, stringField, validationError } from "@/lib/api-contracts";

export const runtime = "nodejs";
export const maxDuration = 60;

// Універсальний експорт 2D-масиву в нову Google-таблицю.

export async function POST(req: NextRequest) {
  const { user: currentUser, response } = await requireApiUser("ANALYST");
  if (response) return response;
  const { tenantId, userId } = currentUser;

  const { data, response: parseResponse } = await parseJsonBody(req);
  if (parseResponse) return parseResponse;

  if (!isRecord(data)) {
    return validationError(["body must be an object"]);
  }

  const issues: string[] = [];
  const title = stringField(data, "title", issues, { required: true, maxLength: 120 });
  const sheetName = stringField(data, "sheetName", issues, { maxLength: 80 }) ?? "Sheet1";
  const values = data.values;

  if (!Array.isArray(values) || values.length === 0) {
    issues.push("values must be a non-empty 2D array");
  } else if (!values.every((row) => Array.isArray(row) && row.every((cell) => typeof cell === "string" || typeof cell === "number" || cell === null))) {
    issues.push("values rows must contain only strings, numbers, or null");
  }

  if (issues.length > 0) {
    return validationError(issues);
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

    const sheet = await createSpreadsheet(title!, values as (string | number)[][], email, sheetName);
    return NextResponse.json(sheet);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return serverError(msg);
  }
}
