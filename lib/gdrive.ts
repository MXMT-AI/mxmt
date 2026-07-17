import { createSign } from "node:crypto";
import * as XLSX from "xlsx";
import { prisma } from "@/lib/prisma";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ServiceAccount {
  client_email: string;
  private_key: string;
}

export interface SyncResult {
  skus: number;
  inventory: number;
  sales: number;
  brands: number;
  sheets: { name: string; rows: number; imported: string; skipped: string }[];
  warning?: string;
}

type Row = Record<string, unknown>;
type SalesRecordInput = {
  tenantId: string;
  skuId: string;
  date: Date;
  qtySold: number;
  revenue: number;
  channel: string;
  isPromo?: boolean;
  returns?: number;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function extractFileId(raw: string): string {
  const patterns = [
    /\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/,
    /\/file\/d\/([a-zA-Z0-9_-]+)/,
    /[?&]id=([a-zA-Z0-9_-]+)/,
  ];
  for (const p of patterns) {
    const m = raw.match(p);
    if (m) return m[1];
  }
  return raw.trim();
}

function str(row: Row, ...keys: string[]): string {
  for (const k of keys) {
    const v = row[k] ?? row[k.toLowerCase()] ?? row[k.toUpperCase()];
    if (v !== undefined && v !== null && String(v).trim() !== "") return String(v).trim();
  }
  return "";
}

function num(row: Row, ...keys: string[]): number {
  for (const k of keys) {
    const raw = row[k] ?? row[k.toLowerCase()] ?? row[k.toUpperCase()];
    const v = parseFloat(String(raw ?? "").replace(/\s/g, "").replace(",", "."));
    if (!isNaN(v)) return v;
  }
  return 0;
}

function int(row: Row, ...keys: string[]): number {
  return Math.round(num(row, ...keys));
}

function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

async function upsertInventorySnapshot(
  tenantId: string,
  skuId: string,
  snapshotDate: Date,
  qtyOnHand: number
): Promise<void> {
  await prisma.inventorySnapshot.upsert({
    where: { tenantId_skuId_snapshotDate: { tenantId, skuId, snapshotDate } },
    create: { tenantId, skuId, qtyOnHand, snapshotDate },
    update: { qtyOnHand },
  });
}

async function upsertSalesRecord(input: SalesRecordInput): Promise<void> {
  await prisma.salesRecord.upsert({
    where: {
      tenantId_skuId_date_channel: {
        tenantId: input.tenantId,
        skuId: input.skuId,
        date: input.date,
        channel: input.channel,
      },
    },
    create: {
      tenantId: input.tenantId,
      skuId: input.skuId,
      date: input.date,
      qtySold: input.qtySold,
      revenue: input.revenue,
      channel: input.channel,
      isPromo: input.isPromo ?? false,
      returns: input.returns ?? 0,
    },
    update: {
      qtySold: input.qtySold,
      revenue: input.revenue,
      isPromo: input.isPromo ?? false,
      returns: input.returns ?? 0,
    },
  });
}

// Handles: DD.MM.YYYY | YYYY-MM-DD | ISO string | JS Date object (from XLSX cellDates)
function parseRowDate(row: Row, ...keys: string[]): Date | null {
  for (const k of keys) {
    const raw = row[k] ?? row[k.toLowerCase()] ?? row[k.toUpperCase()];
    if (raw === undefined || raw === null || raw === "") continue;
    if (raw instanceof Date) return isNaN(raw.getTime()) ? null : raw;
    const s = String(raw).trim();
    if (!s) continue;
    // DD.MM.YYYY or D.M.YYYY
    const dmy = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})/);
    if (dmy) {
      const d = new Date(`${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`);
      if (!isNaN(d.getTime())) return d;
    }
    // ISO or any parseable
    const iso = new Date(s.slice(0, 10));
    if (!isNaN(iso.getTime())) return iso;
  }
  return null;
}

// Find actual header row when sheet has metadata rows at top.
// Returns rows with proper header-keyed objects starting after the header row.
function parseWithAutoHeader(ws: XLSX.WorkSheet): Row[] {
  const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" }) as unknown[][];

  // Find the row that looks like a header (contains "Article" or "SKU" or "product.sku")
  let headerIdx = -1;
  for (let i = 0; i < Math.min(raw.length, 10); i++) {
    const row = raw[i] as unknown[];
    const rowStr = row.map((c) => String(c).toLowerCase());
    if (
      rowStr.some((c) => c === "article" || c === "sku" || c === "артикул") ||
      rowStr.some((c) => c === "product.sku")
    ) {
      headerIdx = i;
      break;
    }
  }

  if (headerIdx === -1) {
    // Fallback: use first row as headers (original behavior)
    return XLSX.utils.sheet_to_json(ws, { defval: "" }) as Row[];
  }

  const headers = (raw[headerIdx] as unknown[]).map((h) => String(h));
  const result: Row[] = [];

  for (let i = headerIdx + 1; i < raw.length; i++) {
    const rowArr = raw[i] as unknown[];
    const obj: Row = {};
    headers.forEach((h, idx) => {
      if (h) obj[h] = rowArr[idx] ?? "";
    });
    result.push(obj);
  }

  return result;
}

// ─── Google auth ──────────────────────────────────────────────────────────────

function buildJwt(sa: ServiceAccount): string {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({
      iss: sa.client_email,
      sub: sa.client_email,
      scope: "https://www.googleapis.com/auth/drive.readonly",
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
  const jwt = buildJwt(sa);
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  if (!res.ok) throw new Error(`Google auth failed: ${await res.text()}`);
  const data = await res.json();
  return data.access_token as string;
}

async function downloadFile(fileId: string, accessToken: string): Promise<Buffer> {
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!res.ok) throw new Error(`Drive download failed: ${res.status} ${res.statusText}`);
  return Buffer.from(await res.arrayBuffer());
}

async function downloadPublicFile(fileId: string): Promise<Buffer> {
  const urls = [
    `https://docs.google.com/spreadsheets/d/${fileId}/export?format=xlsx`,
    `https://drive.google.com/uc?export=download&id=${fileId}`,
  ];
  let lastError = "";
  for (const url of urls) {
    try {
      const res = await fetch(url, { redirect: "follow", headers: { "User-Agent": "Mozilla/5.0" } });
      if (!res.ok) { lastError = `${res.status} (${url})`; continue; }
      const ct = res.headers.get("content-type") ?? "";
      if (ct.includes("text/html")) { lastError = `HTML response (${url}) — check file is publicly shared`; continue; }
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.byteLength < 100) { lastError = `Empty response (${url})`; continue; }
      return buf;
    } catch (e) {
      lastError = String(e);
    }
  }
  throw new Error(
    `Could not download file.\n` +
    `Make sure the file is shared: Google Sheets → Share → Anyone with the link → Viewer\n` +
    `Last error: ${lastError}`
  );
}

// ─── Brand helpers ────────────────────────────────────────────────────────────

async function findOrCreateBrand(tenantId: string, name: string, cache: Map<string, string>): Promise<string | null> {
  if (!name) return null;
  const key = name.toLowerCase().trim();
  if (cache.has(key)) return cache.get(key)!;
  let brand = await prisma.brand.findFirst({
    where: { tenantId, name: { equals: name, mode: "insensitive" } },
  });
  if (!brand) {
    brand = await prisma.brand.create({ data: { tenantId, name: name.trim() } });
  }
  cache.set(key, brand.id);
  return brand.id;
}

// ─── ARTICLE REPORT importer ──────────────────────────────────────────────────
// Handles sheets like "ARTICLE REPORT" that contain:
//   Article | Name | Brand | Category | Cost Price | RRP | Retail Price |
//   Sales,units | 1..12 (monthly) | Stock units | Sales Last week | WOH | ...

async function importArticleReport(
  tenantId: string,
  rows: Row[],
  brandCache: Map<string, string>
): Promise<{ skus: number; inventory: number; sales: number; brands: number }> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // "Sales Last week" → use Monday of last week as the date
  const lastMonday = new Date(today);
  lastMonday.setDate(today.getDate() - today.getDay() - 6);

  // Determine current season label for CatalogUpload
  const m0 = today.getMonth() + 1;
  const yy = String(today.getFullYear()).slice(-2);
  const currentSeason = `${m0 >= 3 && m0 <= 8 ? "SS" : "AW"}${yy} (Drive)`;

  let skuCount = 0, invCount = 0, salesCount = 0;
  const brandsCreatedBefore = brandCache.size;

  // Collect catalog items per brand for batch catalog sync at the end
  const catalogBatch = new Map<string, Array<{
    sku: string; name: string; category: string;
    priceWholesale: number; priceRetail: number | null; stockAvail: number;
  }>>();

  for (const row of rows) {
    const skuCode = str(row, "Article", "article", "SKU", "sku", "Артикул", "ID", "id");
    const name = str(row, "Name", "name", "Назва", "Description", "description");
    if (!skuCode || !name || skuCode === "#" || /^\d+$/.test(skuCode.trim())) continue;

    const brandName = str(row, "Brand", "brand", "Бренд", "UKR Brand", "manufacturer");
    const brandId = brandName ? await findOrCreateBrand(tenantId, brandName, brandCache) : null;

    const category = str(row, "Category", "category", "Категорія", "Категория") || "Other";
    const priceRetail = num(row, "Retail Price", "retail price", "RRP", "rrp") ||
                        num(row, "Retail Price", "RRP", "Price", "price");
    const pricePurchase = num(row, "Cost Price", "cost price", "Cost", "cost");

    const sku = await prisma.sku.upsert({
      where: { tenantId_sku: { tenantId, sku: skuCode } },
      create: {
        tenantId, brandId, sku: skuCode, name,
        category, priceRetail, pricePurchase, status: "ACTIVE",
      },
      update: { name, brandId, category, priceRetail, pricePurchase, status: "ACTIVE" },
    });
    skuCount++;

    // Import inventory snapshot from "Stock units"
    const stockQty = int(row, "Stock units", "stock units", "Stock", "stock", "Залишок", "залишок");
    await upsertInventorySnapshot(tenantId, sku.id, today, stockQty);
    invCount++;

    // Import monthly sales columns (1-12) as individual month records
    const currentYear = today.getFullYear();
    const currentMonth = today.getMonth() + 1;
    for (let m = 1; m <= 12; m++) {
      if (m > currentMonth) continue;
      const monthlySales = int(row, String(m));
      if (monthlySales <= 0) continue;
      const monthDate = new Date(currentYear, m - 1, 1);
      await upsertSalesRecord({
        tenantId,
        skuId: sku.id,
        date: monthDate,
        qtySold: monthlySales,
        revenue: monthlySales * (sku.priceRetail ?? 0),
        channel: "offline",
      });
      salesCount++;
    }

    // Also import "Sales Last week" as a weekly record
    const lastWeekSales = int(row, "Sales Last week", "sales last week", "Sales last week");
    if (lastWeekSales > 0) {
      await upsertSalesRecord({
        tenantId,
        skuId: sku.id,
        date: lastMonday,
        qtySold: lastWeekSales,
        revenue: lastWeekSales * (sku.priceRetail ?? 0),
        channel: "offline",
      });
      salesCount++;
    }

    // Collect for catalog sync (only branded items — CatalogItem requires brandId)
    if (brandId) {
      if (!catalogBatch.has(brandId)) catalogBatch.set(brandId, []);
      catalogBatch.get(brandId)!.push({
        sku: skuCode, name, category,
        priceWholesale: pricePurchase,
        priceRetail: priceRetail > 0 ? priceRetail : null,
        stockAvail: stockQty,
      });
    }
  }

  // ── Sync to CatalogItem so Drive-imported items appear in Assortment Planner ──
  for (const [brandId, items] of catalogBatch) {
    if (items.length === 0) continue;

    // Find or create the "Drive" CatalogUpload for this brand+season
    const upload = await prisma.catalogUpload.upsert({
      where: { tenantId_brandId_season: { tenantId, brandId, season: currentSeason } },
      create: { tenantId, brandId, season: currentSeason, itemCount: 0 },
      update: {},
    });

    // Replace all items for this upload (full refresh on each sync)
    await prisma.catalogItem.deleteMany({ where: { catalogId: upload.id } });
    await prisma.catalogItem.createMany({
      data: items.map((item) => ({
        tenantId,
        catalogId: upload!.id,
        brandId,
        sku: item.sku,
        name: item.name,
        category: item.category,
        priceWholesale: item.priceWholesale,
        priceRetail: item.priceRetail,
        stockAvail: item.stockAvail,
        minOrder: 1,
        leadTimeDays: 14,
      })),
    });
    await prisma.catalogUpload.update({ where: { id: upload.id }, data: { itemCount: items.length } });
  }

  return { skus: skuCount, inventory: invCount, sales: salesCount, brands: brandCache.size - brandsCreatedBefore };
}

// ─── ZAVOD_API importer ───────────────────────────────────────────────────────
// Handles order export sheets with columns: orderTime, product.sku, product.amount, etc.

async function importZavodApi(tenantId: string, rows: Row[]): Promise<number> {
  const aggregates = new Map<string, { skuCode: string; date: Date; qtySold: number; revenue: number }>();

  for (const row of rows) {
    const skuCode = str(row, "product.sku");
    const qty = int(row, "product.amount");

    // Skip discount/coupon/empty lines
    if (!skuCode || qty <= 0) continue;
    if (skuCode === "COUPON" || skuCode.length < 3) continue;

    const date = parseRowDate(row, "orderTime", "paymentDate");
    if (!date) continue;

    // Normalize to midnight UTC
    date.setUTCHours(0, 0, 0, 0);

    const revenue = num(row, "ProductPaymentAmount", "product.price", "paymentAmount");
    const key = `${skuCode}|${dateKey(date)}`;
    const aggregate = aggregates.get(key) ?? { skuCode, date, qtySold: 0, revenue: 0 };
    aggregate.qtySold += qty;
    aggregate.revenue += revenue;
    aggregates.set(key, aggregate);
  }

  let count = 0;
  for (const aggregate of aggregates.values()) {
    const sku = await prisma.sku.findUnique({ where: { tenantId_sku: { tenantId, sku: aggregate.skuCode } } });
    if (!sku) continue;
    await upsertSalesRecord({
      tenantId,
      skuId: sku.id,
      date: aggregate.date,
      qtySold: aggregate.qtySold,
      revenue: aggregate.revenue,
      channel: "online",
    });
    count++;
  }
  return count;
}

// ─── Generic importers (fallback) ─────────────────────────────────────────────

async function importSkus(tenantId: string, rows: Row[], brandCache: Map<string, string>): Promise<number> {
  let count = 0;
  for (const row of rows) {
    const skuCode = str(row, "SKU", "sku", "Артикул", "артикул", "Article", "article", "Код", "код");
    const name = str(row, "Name", "name", "Назва", "назва", "Наименование", "Товар");
    if (!skuCode || !name) continue;
    const brandName = str(row, "Brand", "brand", "Бренд", "manufacturer");
    const brandId = brandName ? await findOrCreateBrand(tenantId, brandName, brandCache) : null;
    await prisma.sku.upsert({
      where: { tenantId_sku: { tenantId, sku: skuCode } },
      create: {
        tenantId, brandId, sku: skuCode, name,
        category: str(row, "Category", "category", "Категорія", "Категория") || "Other",
        priceRetail: num(row, "Price", "price", "Ціна", "RRP", "Retail Price"),
        pricePurchase: num(row, "Cost", "cost", "Собівартість", "Cost Price"),
        status: "ACTIVE",
      },
      update: {
        name, brandId,
        category: str(row, "Category", "category", "Категорія") || "Other",
        priceRetail: num(row, "Price", "price", "Ціна", "RRP"),
        pricePurchase: num(row, "Cost", "cost", "Собівартість", "Cost Price"),
      },
    });
    count++;
  }
  return count;
}

async function importInventory(tenantId: string, rows: Row[]): Promise<number> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let count = 0;
  for (const row of rows) {
    const skuCode = str(row, "SKU", "sku", "Артикул", "Article", "article", "Код");
    const qty = int(row, "Stock", "stock", "Залишок", "залишок", "QtyOnHand", "Stock units", "stock units", "Qty", "qty");
    if (!skuCode) continue;
    const sku = await prisma.sku.findUnique({ where: { tenantId_sku: { tenantId, sku: skuCode } } });
    if (!sku) continue;
    await upsertInventorySnapshot(tenantId, sku.id, today, qty);
    count++;
  }
  return count;
}

async function importSales(tenantId: string, rows: Row[]): Promise<number> {
  let count = 0;
  for (const row of rows) {
    const skuCode = str(row, "SKU", "sku", "Артикул", "Код", "product.sku");
    const qty = int(row, "Qty", "qty", "QtySold", "Кількість", "product.amount", "Sales Last week");
    const revenue = num(row, "Revenue", "revenue", "Виручка", "paymentAmount", "ProductPaymentAmount");
    if (!skuCode || qty === 0) continue;
    const date = parseRowDate(row, "Date", "date", "Дата", "orderTime", "paymentDate");
    if (!date) continue;
    const sku = await prisma.sku.findUnique({ where: { tenantId_sku: { tenantId, sku: skuCode } } });
    if (!sku) continue;
    await upsertSalesRecord({ tenantId, skuId: sku.id, date, qtySold: qty, revenue, channel: "offline" });
    count++;
  }
  return count;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function isDriveConfigured(): boolean {
  return !!process.env.GOOGLE_DRIVE_FILE_ID;
}

export function getDriveMode(): "service_account" | "public_link" | "none" {
  if (!process.env.GOOGLE_DRIVE_FILE_ID) return "none";
  if (process.env.GOOGLE_SERVICE_ACCOUNT_KEY) return "service_account";
  return "public_link";
}

export async function syncFromDrive(tenantId: string): Promise<SyncResult> {
  const rawId = process.env.GOOGLE_DRIVE_FILE_ID;
  if (!rawId) throw new Error("GOOGLE_DRIVE_FILE_ID not set");
  const fileId = extractFileId(rawId);

  let buffer: Buffer;
  if (process.env.GOOGLE_SERVICE_ACCOUNT_KEY) {
    const sa: ServiceAccount = JSON.parse(
      Buffer.from(process.env.GOOGLE_SERVICE_ACCOUNT_KEY, "base64").toString("utf-8")
    );
    buffer = await downloadFile(fileId, await getAccessToken(sa));
  } else {
    buffer = await downloadPublicFile(fileId);
  }

  const wb = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const brandCache = new Map<string, string>();

  let totalSkus = 0, totalInventory = 0, totalSales = 0, totalBrands = 0;
  const sheets: SyncResult["sheets"] = [];

  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    const nameLower = sheetName.toLowerCase().replace(/\s+/g, " ").trim();

    // Use auto-header detection for all sheets
    const rows = parseWithAutoHeader(ws);
    if (rows.length === 0) {
      sheets.push({ name: sheetName, rows: 0, imported: "пропущено", skipped: "порожній аркуш" });
      continue;
    }

    const firstRow = rows[0];
    const cols = Object.keys(firstRow).map((k) => k.toLowerCase());

    // Detect sheet type
    const isArticleReport =
      nameLower.includes("article report") ||
      (cols.includes("article") && cols.some((c) => c.includes("stock units") || c === "woh"));

    const isZavodApi =
      nameLower.includes("zavod_api") || nameLower.includes("zavod api") ||
      cols.includes("product.sku");

    const hasSku = cols.some((c) =>
      ["sku", "артикул", "арт", "код", "article", "item"].some((p) => c.includes(p))
    );
    const hasSalesDate = cols.some((c) => c.includes("date") || c.includes("дата") || c.includes("ordertime"));
    const hasStock = cols.some((c) =>
      ["stock", "залиш", "qty", "кількість", "balance"].some((p) => c.includes(p))
    );

    if (isArticleReport) {
      const r = await importArticleReport(tenantId, rows, brandCache);
      totalSkus += r.skus; totalInventory += r.inventory; totalSales += r.sales; totalBrands += r.brands;
      sheets.push({ name: sheetName, rows: rows.length, imported: `SKU: ${r.skus}, каталог: ${r.skus}, залишки: ${r.inventory}, продажі: ${r.sales}, бренди: ${r.brands}`, skipped: "" });
      continue;
    }

    if (isZavodApi) {
      const n = await importZavodApi(tenantId, rows);
      totalSales += n;
      sheets.push({ name: sheetName, rows: rows.length, imported: `продажі: ${n}`, skipped: "" });
      continue;
    }

    if (!hasSku) {
      sheets.push({ name: sheetName, rows: rows.length, imported: "пропущено", skipped: `не знайдено SKU-колонку. Колонки: ${cols.slice(0, 5).join(", ")}` });
      continue;
    }

    // Generic handlers
    if (nameLower.includes("sales") || nameLower.includes("продаж") || hasSalesDate) {
      const n = await importSales(tenantId, rows);
      totalSales += n;
      sheets.push({ name: sheetName, rows: rows.length, imported: `продажі: ${n}`, skipped: "" });
    } else {
      const s = await importSkus(tenantId, rows, brandCache);
      totalSkus += s;
      let extra = "";
      if (hasStock) {
        const inv = await importInventory(tenantId, rows);
        totalInventory += inv;
        extra += `, залишки: ${inv}`;
      }
      sheets.push({ name: sheetName, rows: rows.length, imported: `SKU: ${s}${extra}`, skipped: "" });
    }
  }

  const total = totalSkus + totalInventory + totalSales;
  const warning = total === 0
    ? `Імпортовано 0 записів. Аркуші: ${sheets.map((s) => `"${s.name}": ${s.skipped || s.imported}`).join("; ")}`
    : undefined;

  return { skus: totalSkus, inventory: totalInventory, sales: totalSales, brands: totalBrands, sheets, warning };
}
