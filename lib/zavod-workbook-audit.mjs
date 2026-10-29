import * as XLSX from "xlsx";
import { readWorkbook, sheetToJson } from "./workbook-compat.mjs";
import { financialDecimal as D } from "./financial-decimal.mjs";
import { evidenceHash, compareBenchmark } from "./zavod-reconciliation.mjs";

const number = (value) => {
  if (
    value === null ||
    value === undefined ||
    value === "" ||
    typeof value === "boolean"
  )
    return null;
  try {
    const n = D(value);
    return n.isFinite() ? n : null;
  } catch {
    return null;
  }
};
const excelDate = (value) => {
  if (typeof value !== "number") return null;
  const d = XLSX.default.SSF.parse_date_code(value);
  return d
    ? `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`
    : null;
};
const nonempty = (row) => row.some((v) => v !== null && v !== "");
function table(sheet, headerRow = 0) {
  if (!sheet) return { headers: [], rows: [] };
  const matrix = sheetToJson(sheet, {
    header: 1,
    defval: null,
    blankrows: true,
    raw: true,
  });
  const headers = (matrix[headerRow] ?? []).map((v) => String(v ?? ""));
  return {
    headers,
    rows: matrix
      .slice(headerRow + 1)
      .filter(nonempty)
      .map((row) =>
        Object.fromEntries(headers.map((h, i) => [h, row[i] ?? null])),
      ),
  };
}
function aggregate(rows) {
  const orders = new Set();
  let units = D(0),
    gross = D(0),
    cost = D(0),
    unitNet = D(0),
    lineNet = D(0),
    invalid = 0,
    zeroCost = 0,
    missingOrder = 0,
    missingQuantity = 0;
  for (const r of rows) {
    const id = r.orderId ?? r.id;
    if (id === null || id === undefined || String(id).trim() === "")
      missingOrder++;
    else orders.add(String(id));
    const q = number(r["product.amount"]),
      p = number(r["product.price"]),
      c = number(r["product.costPrice"]),
      discount = number(r["product.discount"]);
    const flag = number(r["product.percentDiscount"]);
    if (q) units = units.add(q);
    else missingQuantity++;
    if (
      !q ||
      !p ||
      !c ||
      !discount ||
      !flag ||
      ![0, 1].includes(flag.toNumber())
    ) {
      invalid++;
      continue;
    }
    if (c.isZero()) zeroCost++;
    gross = gross.add(p.mul(q));
    cost = cost.add(c.mul(q));
    const percentage = Number(r["product.percentDiscount"]) === 1;
    unitNet = unitNet.add(
      percentage
        ? p.mul(D(1).sub(discount.div(100))).mul(q)
        : p.sub(discount).mul(q),
    );
    lineNet = lineNet.add(
      percentage
        ? p.mul(D(1).sub(discount.div(100))).mul(q)
        : p.mul(q).sub(discount),
    );
  }
  return {
    lineCount: rows.length,
    distinctOrders: orders.size,
    missingOrderRows: missingOrder,
    missingQuantityRows: missingQuantity,
    units: units.toString(),
    grossPriceTimesQuantity: gross.toString(),
    unitCostTimesQuantity: cost.toString(),
    candidateDiscountPerUnitRevenue: unitNet.toString(),
    candidateDiscountPerLineRevenue: lineNet.toString(),
    candidateUnitCostDifference: lineNet.sub(cost).toString(),
    invalidNumericRows: invalid,
    zeroCostRows: zeroCost,
    accountingAccepted: false,
  };
}

/** Read cached workbook values/formulas without recalculating or changing the source.
 * Candidate discount/cost arithmetic is explicitly not verified SalesDrive accounting.
 */
export function auditZavodWorkbook(buffer, reference) {
  if (buffer.length > 15 * 1024 * 1024) throw new Error("WORKBOOK_TOO_LARGE");
  // Raw serials preserve numeric prices even when a source cell has a date number format.
  const wb = readWorkbook(buffer, {
    type: "buffer",
    cellDates: false,
    cellNF: true,
  });
  const api = table(wb.Sheets.ZAVOD_API),
    catalog = table(wb.Sheets["Product YML 2.0"]),
    article = wb.Sheets["ARTICLE REPORT"];
  if (!api.headers.length || !catalog.headers.length)
    throw new Error("REQUIRED_SOURCE_SHEET_MISSING");
  const rawFields = [
    "paymentDate",
    "statusId",
    "product.amount",
    "product.price",
    "product.costPrice",
    "product.discount",
    "product.percentDiscount",
  ];
  if (
    rawFields.some((h) => !api.headers.includes(h)) ||
    ["ID", "Stock Qty", "Vendor Price"].some(
      (h) => !catalog.headers.includes(h),
    )
  )
    throw new Error("REQUIRED_RAW_FIELDS_MISSING");
  const issues = new Set([
    "SOURCE_STOCK_OBSERVATION_DATE_UNCONFIRMED",
    "OWNERSHIP_AND_SERVICE_COST_REQUIRE_APPROVAL",
    "DISCOUNT_AND_PRICE_BASIS_REQUIRE_APPROVAL",
  ]);
  const missingLegacyAmountHeaders = [
    "ProductPaymentAmount",
    "ProductcostPriceAmount",
  ].filter((h) => !api.headers.includes(h));
  if (missingLegacyAmountHeaders.length)
    issues.add("WORKBOOK_DIFFERS_FROM_LEGACY_IMPORT_SCHEMA");
  const transactions = api.rows.filter((r) =>
    [r.id, r.orderId, r.statusId, r.paymentDate].some(
      (v) => v !== null && v !== undefined && v !== "",
    ),
  );
  const undatedPaidSaleRows = transactions.filter(
    (r) =>
      [5, 59, 60].includes(Number(r.statusId)) && !excelDate(r.paymentDate),
  ).length;
  if (undatedPaidSaleRows) issues.add("PAID_SALE_ROWS_WITHOUT_PAYMENT_DATE");
  const returnRows = transactions.filter(
    (r) => Number(r.statusId) === 7,
  ).length;
  if (returnRows) issues.add("RETURN_EVENT_DATES_UNVERIFIED");
  const periods = Object.fromEntries(
    ["2026-09", "2025-09"].map((month) => {
      const selected = transactions.filter(
        (r) => excelDate(r.paymentDate)?.slice(0, 7) === month,
      );
      const recognized = selected.filter((r) =>
        [5, 59, 60].includes(Number(r.statusId)),
      );
      const refusal = selected.filter((r) => Number(r.statusId) === 6);
      const channels = [
        ...new Set(recognized.map((r) => String(r.sajt ?? "UNKNOWN"))),
      ]
        .sort()
        .map((id) => ({
          id,
          ...aggregate(
            recognized.filter((r) => String(r.sajt ?? "UNKNOWN") === id),
          ),
        }));
      return [
        month,
        {
          ...aggregate(recognized),
          sourceDateBasis: "EXCEL_WALL_CALENDAR_PAYMENT_DATE",
          saleStatuses: [5, 59, 60],
          channels,
          excludedRefusals: aggregate(refusal),
          rawRowsIncludingRefusals: aggregate([...recognized, ...refusal]),
          statusCounts: Object.fromEntries(
            [...new Set(selected.map((r) => String(r.statusId)))]
              .sort()
              .map((status) => [
                status,
                selected.filter((r) => String(r.statusId) === status).length,
              ]),
          ),
        },
      ];
    }),
  );
  const products = catalog.rows.filter(
    (r) => r.ID !== null && String(r.ID).trim() !== "",
  );
  let quantity = D(0),
    cost = D(0),
    sourceAmount = D(0),
    invalidStock = 0,
    missingSourceAmount = 0;
  for (const r of products) {
    const q = number(r["Stock Qty"]),
      c = number(r["Vendor Price"]),
      a = number(r["Stock Amount"]);
    if (!q || !c) {
      invalidStock++;
      continue;
    }
    quantity = quantity.add(q);
    cost = cost.add(q.mul(c));
    if (a) sourceAmount = sourceAmount.add(a);
    else missingSourceAmount++;
  }
  const stock = {
    productRows: products.length,
    units: quantity.toString(),
    cost: cost.toString(),
    cachedSourceAmount: sourceAmount.toString(),
    invalidNumericRows: invalidStock,
    missingCachedStockAmountRows: missingSourceAmount,
    observationDate: null,
    scope: "UNFILTERED_SOURCE_CATALOG_NOT_CONFIRMED_MERCHANDISE",
  };
  const formulas = ["M6", "Z6", "AA6", "AG6"]
    .filter((address) => article?.[address]?.f)
    .map((address) => {
      const formula = article[address].f;
      return {
        cell: address,
        formula,
        references: [...formula.matchAll(/ZAVOD_API!\$([A-Z]+):/g)].map(
          (m) => ({
            column: m[1],
            header: api.headers[XLSX.utils.decode_col(m[1])] ?? null,
          }),
        ),
      };
    });
  const expectedMeasures = {
    M6: "product.amount",
    Z6: "ProductPaymentAmount",
    AA6: "ProductcostPriceAmount",
    AG6: "product.amount",
  };
  if (
    formulas.some((f) => f.references[0]?.header !== expectedMeasures[f.cell])
  )
    issues.add("ARTICLE_FORMULAS_REFERENCE_DIFFERENT_FIELDS");
  const controls = {
    from: excelDate(article?.M2?.v),
    to: excelDate(article?.M3?.v),
    stockUnits: article?.AD4?.v ?? null,
    stockCost: article?.AE4?.v ?? null,
    stockUnitsFormula: article?.AD4?.f ?? null,
    stockCostFormula: article?.AE4?.f ?? null,
  };
  if (
    controls.from !== reference.period.from ||
    controls.to !== reference.period.to
  )
    issues.add("ARTICLE_CONTROLS_NOT_REFERENCE_MONTH");
  if (
    article?.AD4?.f?.includes("4002") &&
    XLSX.utils.decode_range(article["!ref"] ?? "A1").e.r + 1 > 4002
  )
    issues.add("ARTICLE_SUBTOTAL_RANGE_REQUIRES_TAIL_REVIEW");
  const current = periods["2026-09"],
    ly = periods["2025-09"];
  const comparisons = [
    compareBenchmark(
      "candidateRevenue",
      reference.metrics.revenue,
      current.candidateDiscountPerLineRevenue,
      {
        complete: current.invalidNumericRows === 0 && undatedPaidSaleRows === 0,
      },
    ),
    compareBenchmark(
      "candidateUnitCostDifference_NOT_VERIFIED_GP",
      reference.metrics.grossProfit,
      current.candidateUnitCostDifference,
      {
        complete: current.invalidNumericRows === 0 && undatedPaidSaleRows === 0,
      },
    ),
    compareBenchmark(
      "sourceDistinctSaleOrders",
      reference.metrics.orderCount,
      current.distinctOrders,
      {
        exact: true,
        complete: current.missingOrderRows === 0 && undatedPaidSaleRows === 0,
      },
    ),
    compareBenchmark(
      "sourceSaleUnits",
      reference.metrics.salesUnits,
      current.units,
      {
        exact: true,
        complete:
          current.missingQuantityRows === 0 && undatedPaidSaleRows === 0,
      },
    ),
    compareBenchmark(
      "unfilteredCatalogCost",
      reference.metrics.stockCost,
      stock.cost,
      { complete: invalidStock === 0 },
    ),
    compareBenchmark(
      "unfilteredCatalogUnits",
      reference.metrics.stockUnits,
      stock.units,
      { complete: invalidStock === 0, exact: true },
    ),
    compareBenchmark(
      "candidateLyRevenue",
      reference.metrics.lyRevenue,
      ly.candidateDiscountPerLineRevenue,
      { complete: ly.invalidNumericRows === 0 && undatedPaidSaleRows === 0 },
    ),
    compareBenchmark(
      "candidateLyUnitCostDifference_NOT_VERIFIED_GP",
      reference.metrics.lyGrossProfit,
      ly.candidateUnitCostDifference,
      { complete: ly.invalidNumericRows === 0 && undatedPaidSaleRows === 0 },
    ),
  ];
  return {
    schemaVersion: 1,
    sourceSha256: evidenceHash(buffer),
    status: "REQUIRES_SOURCE_RECONCILIATION",
    customerAcceptance: "NOT_APPROVED",
    sheets: wb.SheetNames.map((name) => ({
      name,
      range: wb.Sheets[name]["!ref"] ?? null,
    })),
    missingLegacyAmountHeaders,
    periods,
    stock,
    article: { controls, formulas },
    returnRowsWithoutVerifiedEventDates: returnRows,
    undatedPaidSaleRows,
    comparisons,
    issues: [...issues].sort(),
    note: "Candidate arithmetic includes zero source costs and unverified product/ownership meanings. It does not establish complete GP or historical stock. Refusals remain excluded under D02; displayed comparison candidates never change ingestion policy.",
  };
}
