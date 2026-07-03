import { createSign } from "crypto";
import * as XLSX from "xlsx";

// Створення Google-таблиці через service account — БЕЗ Google Sheets API.
// Будуємо .xlsx на сервері і вантажимо в Drive з автоконвертацією в Google Sheets
// (формули виживають при конвертації). Потрібен тільки Google Drive API,
// який вже ввімкнений для Drive sync.
//
// Куди створюється файл:
//   1. GOOGLE_DRIVE_EXPORT_FOLDER_ID — папка, розшарена на email сервіс-акаунта (рекомендовано);
//   2. без папки — файл у Drive сервіс-акаунта + доступ для користувача (email або за посиланням).

interface ServiceAccount {
  client_email: string;
  private_key: string;
}

const WRITE_SCOPE = "https://www.googleapis.com/auth/drive";

function loadServiceAccount(): ServiceAccount {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!raw) {
    throw new Error(
      "GOOGLE_SERVICE_ACCOUNT_KEY не налаштовано — серверний експорт недоступний. Використай кнопку «У свій Google Drive» або налаштуй service account у Railway Variables."
    );
  }
  return JSON.parse(Buffer.from(raw, "base64").toString("utf-8"));
}

// Користувач міг вставити повний URL папки замість ID
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
  const res = await fetch("https://oauth2.googleapis.com/token", {
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
        "Google не прийняв ключ сервіс-акаунта (invalid_grant). Перевір що GOOGLE_SERVICE_ACCOUNT_KEY — це base64 від повного JSON-ключа і ключ не відкликаний."
      );
    }
    throw new Error(`Google auth failed: ${text}`);
  }
  return (await res.json()).access_token as string;
}

// Перетворює зрозумілі Google-помилки на дієві підказки
function translateDriveError(text: string, sa: ServiceAccount, folderId: string | null): string {
  if (/accessNotConfigured|SERVICE_DISABLED|has not been used in project/i.test(text)) {
    return `У Google Cloud проєкті не ввімкнено Google Drive API. Відкрий console.cloud.google.com → APIs & Services → Library → Google Drive API → Enable. (${sa.client_email})`;
  }
  if (folderId && /(notFound|File not found)/i.test(text)) {
    return `Папку для експорту (${folderId}) не знайдено або вона не розшарена на сервіс-акаунт. Відкрий папку в Google Drive → Поділитися → додай ${sa.client_email} з правом «Редактор». Після зміни змінної в Railway потрібен redeploy.`;
  }
  if (/storageQuota|Service Accounts.*(storage|quota)|cannotAddParent|ownership/i.test(text)) {
    return `Google не дозволяє сервіс-акаунту володіти файлами (квота сховища). Рішення: використай кнопку «У свій Google Drive» (без налаштувань), або створи папку в Shared Drive і розшар її на ${sa.client_email}.`;
  }
  if (/insufficientPermissions|insufficientFilePermissions/i.test(text)) {
    return `Сервіс-акаунту ${sa.client_email} бракує прав на папку. Розшар папку з правом «Редактор» (не «Переглядач»).`;
  }
  return `Google Drive API: ${text.slice(0, 400)}`;
}

// 2D-масив → xlsx buffer; рядки що починаються з "=" стають живими формулами
export function valuesToXlsxBuffer(values: (string | number)[][], sheetName: string): Buffer {
  const ws = XLSX.utils.aoa_to_sheet(values);
  for (const addr of Object.keys(ws)) {
    if (addr.startsWith("!")) continue;
    const cell: any = (ws as any)[addr];
    if (cell && typeof cell.v === "string" && cell.v.startsWith("=")) {
      cell.f = cell.v.slice(1);
      cell.t = "n";
      cell.v = 0; // placeholder: Excel/Sheets перерахують при відкритті
    }
  }
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
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

  // 1. Будуємо xlsx і вантажимо в Drive з конвертацією в Google Sheets (multipart upload)
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

  const uploadRes = await fetch(
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

  // 2. Якщо файл не в розшареній папці — дати доступ користувачу.
  //    Спершу email напряму; якщо це не Google-акаунт — доступ "writer" за посиланням.
  let sharedWith: string | null = null;
  if (!folderId) {
    const share = async (perm: Record<string, string>) => {
      const res = await fetch(
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
        // email не привʼязаний до Google — підемо через посилання
      }
    }
    if (!sharedWith) {
      try {
        await share({ role: "writer", type: "anyone" });
        sharedWith = "anyone_with_link";
      } catch {
        // навіть якщо share не вдався — повертаємо URL, файл існує
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
