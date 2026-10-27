import { payloadHash } from "../order-storage";
import { Prisma } from "@prisma/client";
import type { OrderDto, ProductDto, StockDto } from "../contract";
import type { ShopifyConfig } from "./config";
import {
  decimal,
  gid,
  instant,
  integer,
  list,
  money,
  object,
  optionalText,
  text,
  invalid,
  type Row,
} from "./values";
/** Only successful, non-test money movements with complete positive amounts establish an event time. */
function paid(
  transactions: Row[],
  currency: string,
  target: string,
  kinds: string[],
): string | null {
  let sum = new Prisma.Decimal(0),
    latest: string | null = null;
  for (const t of transactions) {
    if (
      t.test !== false ||
      t.status !== "SUCCESS" ||
      !kinds.includes(String(t.kind))
    )
      continue;
    const amount = new Prisma.Decimal(money(t.amountSet, currency));
    if (amount.lte(0) || !t.processedAt) return null;
    const at = instant(t.processedAt);
    sum = sum.add(amount);
    if (!latest || at > latest) latest = at;
  }
  return new Prisma.Decimal(target).gt(0) && sum.gte(target) ? latest : null;
}
export interface FullOrder {
  order: Row;
  lines: Row[];
  refunds: Array<{ refund: Row; lines: Row[]; transactions: Row[] }>;
}
/** Original merchandise sales and distinct refund events avoid double-subtracting current net totals. */
export function mapOrders(
  c: ShopifyConfig,
  full: FullOrder,
  observedAt: string,
  audit: (v: Row) => Row,
): OrderDto[] {
  const o = full.order,
    currency = c.evidence.currency,
    base = {
      observedAt,
      updatedAt: instant(o.updatedAt),
      orderedAt: instant(o.createdAt),
      channelId: null,
      costPrice: null,
    };
  const transactions = list(o.transactions, 250),
    count = object(o.transactionsCount);
  if (
    new Set(transactions.map((t) => gid(t.id, "OrderTransaction"))).size !==
    transactions.length
  )
    invalid();
  if (
    integer(count.count) !== transactions.length ||
    count.precision !== "EXACT"
  )
    invalid();
  const refundQty = new Map<string, number>();
  for (const r of full.refunds)
    for (const line of r.lines) {
      const key = gid(object(line.lineItem).id, "LineItem");
      refundQty.set(key, (refundQty.get(key) ?? 0) + integer(line.quantity));
    }
  const financial =
    c.evidence.financials &&
    o.taxesIncluded === false &&
    o.test === false &&
    o.currencyCode === currency &&
    full.lines.every(
      (l) =>
        integer(l.currentQuantity) +
          (refundQty.get(gid(l.id, "LineItem")) ?? 0) ===
        integer(l.quantity),
    );
  if (financial) {
    const merchandise = full.lines.reduce(
      (sum, l) =>
        sum
          .add(
            new Prisma.Decimal(money(l.originalUnitPriceSet, currency)).mul(
              integer(l.quantity),
            ),
          )
          .sub(
            list(l.discountAllocations).reduce(
              (discount, a) =>
                discount.add(money(a.allocatedAmountSet, currency)),
              new Prisma.Decimal(0),
            ),
          ),
      new Prisma.Decimal(0),
    );
    if (
      merchandise.isNegative() ||
      !merchandise.eq(money(o.subtotalPriceSet, currency)) ||
      merchandise.gt(money(o.totalPriceSet, currency))
    )
      invalid();
  }
  const paidAt = financial
    ? paid(transactions, currency, money(o.totalPriceSet, currency), [
        "SALE",
        "CAPTURE",
      ])
    : null;
  const sale: OrderDto = {
    externalId: gid(o.id, "Order"),
    ...base,
    statusId: paidAt ? "1" : o.cancelledAt ? "4" : "3",
    paidAt,
    returnedAt: null,
    lines: full.lines.map((l) => ({
      externalLineId: gid(l.id, "LineItem"),
      productId: l.variant ? gid(object(l.variant).id, "ProductVariant") : null,
      sku: optionalText(l.sku),
      quantity: String(integer(l.quantity)),
      unitPrice: financial ? money(l.originalUnitPriceSet, currency) : null,
      discount: financial
        ? list(l.discountAllocations)
            .reduce(
              (sum, a) => sum.add(money(a.allocatedAmountSet, currency)),
              new Prisma.Decimal(0),
            )
            .toFixed()
        : null,
      discountUnit: financial ? "amount" : "unknown",
      commission: null,
      commissionUnit: "unknown",
      costPrice: null,
    })),
    raw: audit({ ...o, lines: full.lines, refunds: full.refunds }),
  };
  const result = [sale];
  for (const r of full.refunds) {
    const refundTotal = financial
      ? money(r.refund.totalRefundedSet, currency)
      : null;
    const merchandise = financial
      ? r.lines.reduce(
          (sum, line) =>
            sum
              .add(money(line.subtotalSet, currency))
              .add(money(line.totalTaxSet, currency)),
          new Prisma.Decimal(0),
        )
      : null;
    const returnedAt =
      financial &&
      refundTotal !== null &&
      merchandise &&
      new Prisma.Decimal(refundTotal).gte(merchandise)
        ? paid(r.transactions, currency, refundTotal, ["REFUND"])
        : null;
    result.push({
      externalId: gid(r.refund.id, "Refund"),
      ...base,
      updatedAt: instant(r.refund.updatedAt),
      statusId: "2",
      paidAt: null,
      returnedAt,
      lines: r.lines.map((l) => {
        const q = integer(l.quantity),
          source = object(l.lineItem),
          total = financial
            ? new Prisma.Decimal(money(l.subtotalSet, currency))
            : null;
        const unit = q && total ? total.div(q) : null;
        const unitPrice =
          unit && unit.mul(q).eq(total!) && unit.decimalPlaces() <= 4
            ? decimal(unit.toFixed())
            : null;
        return {
          externalLineId: gid(l.id, "RefundLineItem"),
          productId: source.variant
            ? gid(object(source.variant).id, "ProductVariant")
            : null,
          sku: optionalText(source.sku),
          quantity: String(q),
          unitPrice,
          discount: financial ? "0" : null,
          discountUnit: financial ? "amount" : "unknown",
          commission: null,
          commissionUnit: "unknown",
          costPrice: null,
        };
      }),
      raw: audit({
        orderId: o.id,
        ...r.refund,
        lines: r.lines,
        transactions: r.transactions,
      }),
    });
  }
  return result;
}
/** Current inventory cost is deliberately absent from sale COGS and catalog cost provenance. */
export function mapVariant(
  c: ShopifyConfig,
  v: Row,
  levels: Row[],
  observedAt: string,
  audit: (v: Row) => Row,
): { product: ProductDto; stock: StockDto } {
  const p = object(v.product),
    item = object(v.inventoryItem),
    id = gid(v.id, "ProductVariant"),
    selected = c.evidence.locationIds;
  let onHand: string | null = null;
  if (c.evidence.physicalStock && item.tracked === true) {
    const seen = new Set<string>();
    let sum = new Prisma.Decimal(0);
    for (const l of levels) {
      const loc = object(l.location),
        key = gid(loc.id, "Location");
      if (seen.has(key)) invalid();
      seen.add(key);
      if (selected.includes(key)) {
        if (loc.isActive !== true) invalid();
        const q = list(l.quantities).filter((v) => v.name === "on_hand");
        if (q.length !== 1) invalid();
        sum = sum.add(decimal(q[0].quantity));
      }
    }
    if (!selected.some((i) => !seen.has(i))) onHand = decimal(sum.toFixed());
  }
  return {
    product: {
      externalId: id,
      sku: optionalText(v.sku),
      name: `${text(p.title)} / ${text(v.title)}`,
      barcode: optionalText(v.barcode),
      brand: optionalText(p.vendor),
      categoryId: p.productType
        ? `type:${payloadHash(text(p.productType))}`
        : null,
      categoryName: optionalText(p.productType),
      retailPrice: decimal(v.price),
      oldPrice: v.compareAtPrice == null ? null : decimal(v.compareAtPrice),
      costPrice: null,
      currency: c.evidence.currency,
      observedAt,
      updatedAt: instant(v.updatedAt),
      raw: audit({ variant: v, levels }),
    },
    stock: {
      externalId: gid(item.id, "InventoryItem"),
      productId: id,
      onHand,
      inTransit: null,
      observedAt,
      updatedAt: null,
    },
  };
}
