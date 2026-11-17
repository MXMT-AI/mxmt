import { createElement, Fragment } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import SalesSparkline from "@/components/dashboard/sales-sparkline/sales-sparkline";

const props = { label: "Sales trend", emptyMessage: "Insufficient data" };
const zeros = [{ date: "2026-11-15", qty: 0 }, { date: "2026-11-16", qty: 0 }];

it.each([0, 1])("renders the empty state for %s points", length => {
  const html = renderToStaticMarkup(createElement(SalesSparkline, { ...props, data: zeros.slice(0, length) }));
  expect(html).toContain(props.emptyMessage);
  expect(html).not.toContain("<svg");
});

it("renders finite paths for zero sales without treating them as missing data", () => {
  const html = renderToStaticMarkup(createElement(SalesSparkline, { ...props, data: zeros }));
  expect(html).toContain('role="img"');
  expect(html).toContain('d="M 0.0 52.0 L 300.0 52.0"');
  expect(html).not.toMatch(/NaN|Infinity/);
  expect(html).not.toContain(props.emptyMessage);
});

it("keeps accessible titles and gradients unique when rendering multiple charts on the server", () => {
  const html = renderToStaticMarkup(createElement(Fragment, null,
    createElement(SalesSparkline, { ...props, data: zeros }),
    createElement(SalesSparkline, { ...props, label: "Other sales", data: zeros }),
  ));
  const titles = [...html.matchAll(/aria-labelledby="([^"]+)"/g)].map(match => match[1]);
  const gradients = [...html.matchAll(/<linearGradient id="([^"]+)"/g)].map(match => match[1]);
  expect(new Set(titles).size).toBe(2);
  expect(new Set(gradients).size).toBe(2);
  for (const id of titles) expect(html).toContain(`<title id="${id}">`);
  for (const id of gradients) expect(html).toContain(`fill="url(#${id})"`);
});
