import { expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { compileCsv, parseCsvOptions } from "@/lib/connectors/csv/compile";
import {
  csvOptions,
  csvPacket,
  csvFile,
  csvOrders,
} from "../fixtures/csv-connector";
import { CsvConnector } from "@/lib/connectors/csv/adapter";
it("compiles explicit mappings into the existing DTO contract without coercing identity or exact decimal strings", async () => {
  const result = compileCsv(csvPacket(), parseCsvOptions(csvOptions));
  expect(result.preview.errors).toEqual([]);
  expect(result.bundle.orders[0]).toMatchObject({
    externalId: '["00001","sale"]',
    lines: [
      {
        externalLineId: "00001",
        unitPrice: "20.0000",
        discount: "0",
        costPrice: "10.0000",
      },
    ],
  });
  expect(
    (await new CsvConnector(result.bundle).getOrders({ limit: 1 })).nextPage,
  ).toBeNull();
  expect(result.bundle.catalogs[0].stock[0].onHand).toBe("12");
  await expect(new CsvConnector().getOrders()).rejects.toMatchObject({
    code: "NOT_CONFIGURED",
  });
});
it.each(["1,25", "1 000", "1e2", "=2+2", "1.00001", "100000000000000", "NaN"])(
  "rejects locale/rounded/formula money %s",
  (unitPrice) => {
    const result = compileCsv(
      [csvFile("orders", [{ ...csvOrders[0], unitPrice }])],
      csvOptions,
    );
    expect(result.preview.errors).toContainEqual({
      resource: "orders",
      row: 2,
      code: "INVALID_DECIMAL",
    });
  },
);
it.each([
  "10/09/2026",
  "2026-02-30",
  "2026-09-10T12:00:00",
  "2026-09-10T12:00:00+03:00",
])("rejects ambiguous or unsupported date %s", (paidAt) => {
  expect(
    compileCsv([csvFile("orders", [{ ...csvOrders[0], paidAt }])], csvOptions)
      .preview.errors,
  ).toContainEqual({ resource: "orders", row: 2, code: "INVALID_DATE" });
});
it("rejects duplicate line IDs and long identities but keeps missing amounts distinct from zero", () => {
  expect(
    compileCsv([csvFile("orders", [csvOrders[0], csvOrders[0]])], csvOptions)
      .preview.errors[0].code,
  ).toBe("DUPLICATE_ID");
  expect(
    compileCsv(
      [csvFile("orders", [{ ...csvOrders[0], orderId: "x".repeat(201) }])],
      csvOptions,
    ).preview.errors[0].code,
  ).toBe("INVALID_ID");
  const missing = compileCsv(
    [csvFile("orders", [{ ...csvOrders[0], unitPrice: "", costPrice: "" }])],
    csvOptions,
  );
  expect(missing.bundle.orders[0].lines[0].unitPrice).toBeNull();
  const zero = compileCsv(
    [csvFile("orders", [{ ...csvOrders[0], unitPrice: "0" }])],
    csvOptions,
  );
  expect(zero.bundle.orders[0].lines[0].unitPrice).toBe("0");
});
it("requires explicit approval, valid mapping versions/timezones and source currency rules", () => {
  for (const v of [
    { ...csvOptions, approved: false },
    { ...csvOptions, mappingRevision: 0 },
    { ...csvOptions, timezone: "Unknown/Zone" },
    {
      ...csvOptions,
      policy: {
        ...csvOptions.policy,
        amounts: { ...csvOptions.policy.amounts, currency: "uah" },
      },
    },
  ])
    expect(() => parseCsvOptions(v)).toThrow();
});

it("deduplicates equivalent stock instants and sorts mixed fractional timestamps chronologically", () => {
  const product = {
    productId: "p",
    sku: "001",
    name: "Product",
    observedAt: "2026-08-01T00:00:00Z",
  };
  const stock = [
    { productId: "p", observedAt: "2026-10-25T06:00:00.500Z", quantity: "2" },
    { productId: "p", observedAt: "2026-10-25T06:00:00Z", quantity: "1" },
  ];
  const result = compileCsv(
    [csvFile("products", [product]), csvFile("stock", stock)],
    { ...csvOptions, history: null },
  );
  expect(result.preview.errors).toEqual([]);
  expect(
    result.bundle.catalogs.map((c) => ({
      observedAt: c.observedAt,
      quantity: c.stock[0].onHand,
    })),
  ).toEqual([
    { observedAt: "2026-10-25T06:00:00.000Z", quantity: "1" },
    { observedAt: "2026-10-25T06:00:00.500Z", quantity: "2" },
  ]);
  const duplicate = compileCsv(
    [
      csvFile("products", [product]),
      csvFile("stock", [
        stock[1],
        { ...stock[1], observedAt: "2026-10-25T06:00:00.000Z" },
      ]),
    ],
    { ...csvOptions, history: null },
  );
  expect(duplicate.preview.errors).toContainEqual({
    resource: "stock",
    row: 3,
    code: "DUPLICATE_ID",
  });
});
it.each(["complete", "partial"] as const)(
  "rejects products paired with a header-only stock file in %s mode",
  (population) => {
    const result = compileCsv(
      [
        csvFile("products", [
          {
            productId: "p",
            sku: "001",
            name: "Product",
            observedAt: "2026-08-01T00:00:00Z",
          },
        ]),
        csvFile("stock", [], ["productId", "observedAt", "quantity"]),
      ],
      { ...csvOptions, history: null, catalog: population, stock: population },
    );
    expect(result.preview.errors).toContainEqual({
      resource: "stock",
      row: 0,
      code: "PRODUCTS_AND_STOCK_REQUIRED",
    });
    expect(result.bundle.catalogs).toEqual([]);
  },
);
