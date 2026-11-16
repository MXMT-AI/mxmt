import { createElement, isValidElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { CsvRecentUploads } from "@/components/settings/csv-recent-uploads/csv-recent-uploads";
import { Button } from "@/components/ui/button/button";
const uploads = [
  { id: "first", state: "READY", contentHash: "123456789012abcdef" },
  { id: "second", state: "ACTIVE", contentHash: "123456789012ghijkl" },
];
function nodes(node: ReactNode): { type: unknown; props: Record<string, any> }[] {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!isValidElement<{ children?: ReactNode }>(node)) return [];
  return [{ type: node.type, props: node.props }, ...nodes(node.props.children)];
}
it("does not show a history disclosure for an empty list", () => {
  expect(CsvRecentUploads({ uploads: [], busy: false, lang: "en", onOpen: vi.fn() })).toBeNull();
});
it("opens the correct packet by ID even when hash prefixes match", () => {
  const onOpen = vi.fn();
  const buttons = nodes(CsvRecentUploads({ uploads, busy: false, lang: "en", onOpen })).filter(node => node.type === Button);
  expect(buttons).toHaveLength(2);
  buttons[1].props.onClick();
  expect(onOpen).toHaveBeenCalledWith("second");
});
it("disables every history action during another operation", () => {
  const buttons = nodes(CsvRecentUploads({ uploads, busy: true, lang: "en", onOpen: vi.fn() })).filter(node => node.type === Button);
  expect(buttons.every(button => button.props.disabled)).toBe(true);
});
it.each(["uk", "en"] as const)("shows localized disclosure, packet states and shortened hashes in %s", lang => {
  const html = renderToStaticMarkup(createElement(CsvRecentUploads, { uploads, busy: false, lang, onOpen: vi.fn() }));
  expect(html).toContain(lang === "uk" ? "Останні пакети" : "Recent packets");
  expect(html).toContain("READY · 123456789012");
  expect(html).toContain("ACTIVE · 123456789012");
  expect(html).not.toContain("abcdef");
  expect(html.match(/type="button"/g)).toHaveLength(2);
});
