import { createElement, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { Pager } from "@/components/ui/pager/pager";

vi.mock("@/i18n/navigation", () => ({
  Link: (props: ComponentProps<"a">) => createElement("a", props),
}));

const copy = { page: "Page", previous: "Previous", next: "Next" };

it.each([
  { page: 1, totalPages: 3, previous: null, next: 2 },
  { page: 2, totalPages: 3, previous: 1, next: 3 },
  { page: 3, totalPages: 3, previous: 2, next: null },
  { page: 7, totalPages: 3, previous: 3, next: null },
  { page: 7, totalPages: 0, previous: 1, next: null },
])("builds only available links on page $page of $totalPages", ({ page, totalPages, previous, next }) => {
  const href = vi.fn((values: Record<string, string | null>) => `?categoryPage=${values.categoryPage}`);
  const html = renderToStaticMarkup(createElement(Pager, {
    pagination: { page, totalPages, pageSize: 20, totalRows: totalPages * 20 },
    control: "categoryPage",
    href,
    copy,
  }));

  expect(html).toContain(`Page ${page} / ${Math.max(1, totalPages)}`);
  expect(html.includes(copy.previous)).toBe(previous !== null);
  expect(html.includes(copy.next)).toBe(next !== null);
  expect(href.mock.calls).toEqual([previous, next].filter(target => target !== null)
    .map(target => [{ categoryPage: String(target) }]));
});

it("omits navigation for a single page", () => {
  const href = vi.fn();
  const html = renderToStaticMarkup(createElement(Pager, {
    pagination: { page: 1, totalPages: 1, pageSize: 20, totalRows: 9 },
    control: "page",
    href,
    copy,
  }));
  expect(html).toBe("");
  expect(href).not.toHaveBeenCalled();
});
