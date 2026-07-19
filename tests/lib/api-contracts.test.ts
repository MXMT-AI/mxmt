import { describe, expect, it } from "vitest";
import { isRecord, numberField, optionalDate, stringField } from "@/lib/api-contracts";

describe("api contract field helpers", () => {
  it("validates records", () => {
    expect(isRecord({ ok: true })).toBe(true);
    expect(isRecord(null)).toBe(false);
    expect(isRecord([])).toBe(false);
  });

  it("trims string fields and reports missing required values", () => {
    const issues: string[] = [];
    const value = stringField({ name: "  MXMT  " }, "name", issues, { required: true });
    stringField({}, "email", issues, { required: true });

    expect(value).toBe("MXMT");
    expect(issues).toEqual(["email is required"]);
  });

  it("validates numeric bounds", () => {
    const issues: string[] = [];
    const value = numberField({ discount: "25" }, "discount", issues, { min: 0, max: 100 });
    numberField({ qty: -1 }, "qty", issues, { min: 1 });

    expect(value).toBe(25);
    expect(issues).toEqual(["qty must be greater than or equal to 1"]);
  });

  it("validates optional ISO dates", () => {
    const issues: string[] = [];
    const date = optionalDate({ asOf: "2026-07-19" }, "asOf", issues);
    optionalDate({ dateFrom: "not-a-date" }, "dateFrom", issues);

    expect(date?.toISOString().startsWith("2026-07-19")).toBe(true);
    expect(issues).toEqual(["dateFrom must be a valid date"]);
  });
});
