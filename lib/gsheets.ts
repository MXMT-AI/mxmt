import { createSign } from "crypto";
import * as XLSX from "xlsx";
import { fetchWithTimeout } from "@/lib/server-fetch";
import { buildXlsxWorkbook, type SheetCell } from "@/lib/xlsx-workbook";
import { formatMessage } from "@/i18n/format-message";
import { gsheetsMessages as ukrainianCopy } from "@/messages/uk.json";

interface ServiceAccount {
  client_email: string;
  private_key: string;
}

const WRITE_SCOPE = "https://www.googleapis.com/auth/drive";

function loadServiceAccount(): ServiceAccount {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!raw) {
    throw new Error(
      ukrainianCopy.errorGOOGLESERVICEACCOUNTKEYНеНалаштованоСерверний
    );
  }
  return JSON.parse(Buffer.from(raw, "base64").toString("utf-8"));
}

function normalizeFolderId(raw: string): string {
  const m = raw.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  return m ? m[1] : raw.trim();
}

function buildJwt(sa: ServiceAccount, scope: string): string {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({
      iss: sa.client_email,
      sub: sa.client_email,
      scope,
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    })
  ).toString("base64url");
  const signingInput = `${header}.${payload}`;
  const sign = createSign("RSA-SHA256");
  sign.update(signingInput);
  const sig = sign.sign(sa.private_key, "base64url");
  return `${signingInput}.${sig}`;
}

async function getAccessToken(sa: ServiceAccount): Promise<string> {
  const res = await fetchWithTimeout("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: buildJwt(sa, WRITE_SCOPE),
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    if (text.includes("invalid_grant")) {
      throw new Error(
        ukrainianCopy.errorGoogleНеПрийнявКлючСервісАкаунта
      );
    }
    throw new Error(`Google auth failed: ${text}`);
  }
  return (await res.json()).access_token as string;
}

function translateDriveError(text: string, sa: ServiceAccount, folderId: string | null): string {
  if (/accessNotConfigured|SERVICE_DISABLED|has not been used in project/i.test(text)) {
    return formatMessage(ukrainianCopy.уGoogleCloudПроєктіНе, { client_email: sa.client_email });
  }
  if (folderId && /(notFound|File not found)/i.test(text)) {
    return formatMessage(ukrainianCopy.папкуДляЕкспорту, { folderId, client_email: sa.client_email });
  }
  if (/storageQuota|Service Accounts.*(storage|quota)|cannotAddParent|ownership/i.test(text)) {
    return formatMessage(ukrainianCopy.googleНеДозволяєСервісАкаунтуВолодіти, { client_email: sa.client_email });
  }
  if (/insufficientPermissions|insufficientFilePermissions/i.test(text)) {
    return formatMessage(ukrainianCopy.сервісАкаунтуБракуєПравНаПапку, { client_email: sa.client_email });
  }
  return `Google Drive API: ${text.slice(0, 400)}`;
}

export function valuesToXlsxBuffer(values: SheetCell[][], sheetName: string): Buffer {
  return XLSX.write(buildXlsxWorkbook(XLSX, values, sheetName), { type: "buffer", bookType: "xlsx" }) as Buffer;
}

export interface CreatedSheet {
  fileId: string;
  url: string;
  sharedWith: string | null;
}

export async function createSpreadsheet(
  title: string,
  values: (string | number)[][],
  shareWithEmail?: string | null,
  sheetName = "Sheet1"
): Promise<CreatedSheet> {
  const sa = loadServiceAccount();
  const token = await getAccessToken(sa);
  const rawFolder = process.env.GOOGLE_DRIVE_EXPORT_FOLDER_ID || null;
  const folderId = rawFolder ? normalizeFolderId(rawFolder) : null;

  const xlsxBuffer = valuesToXlsxBuffer(values, sheetName);
  const boundary = "mxmt_boundary_" + Date.now().toString(36);
  const metadata = {
    name: title,
    mimeType: "application/vnd.google-apps.spreadsheet",
    ...(folderId ? { parents: [folderId] } : {}),
  };
  const body = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
        JSON.stringify(metadata) +
        `\r\n--${boundary}\r\nContent-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet\r\n\r\n`
    ),
    xlsxBuffer,
    Buffer.from(`\r\n--${boundary}--`),
  ]);

  const uploadRes = await fetchWithTimeout(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": `multipart/related; boundary=${boundary}`,
      },
      body,
    }
  );
  if (!uploadRes.ok) {
    throw new Error(translateDriveError(await uploadRes.text(), sa, folderId));
  }
  const fileId: string = (await uploadRes.json()).id;

  let sharedWith: string | null = null;
  if (!folderId) {
    const share = async (perm: Record<string, string>) => {
      const res = await fetchWithTimeout(
        `https://www.googleapis.com/drive/v3/files/${fileId}/permissions?sendNotificationEmail=false&supportsAllDrives=true`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify(perm),
        }
      );
      if (!res.ok) throw new Error(await res.text());
    };
    if (shareWithEmail) {
      try {
        await share({ role: "writer", type: "user", emailAddress: shareWithEmail });
        sharedWith = shareWithEmail;
      } catch {
      }
    }
    if (!sharedWith) {
      try {
        await share({ role: "writer", type: "anyone" });
        sharedWith = "anyone_with_link";
      } catch {
      }
    }
  }

  return {
    fileId,
    url: `https://docs.google.com/spreadsheets/d/${fileId}`,
    sharedWith,
  };
}

export function isSheetsExportConfigured(): boolean {
  return Boolean(process.env.GOOGLE_SERVICE_ACCOUNT_KEY);
}
