import React from "react";
import { renderToStaticMarkup } from "../helpers/render-localized";
import { expect, it, vi } from "vitest";
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()), useRouter: () => ({ refresh: vi.fn() }) }));
import CsvImportCard from "@/components/settings/CsvImportCard";
it("keeps upload controls administrator-only and separates approval, preview and activation", () => {
  const viewer = renderToStaticMarkup(
    React.createElement(CsvImportCard, { lang: "en", canManage: false }),
  );
  expect(viewer).not.toContain("<form");
  expect(viewer).not.toContain('type="file"');
  const admin = renderToStaticMarkup(
    React.createElement(CsvImportCard, { lang: "en", canManage: true }),
  );
  expect(admin.match(/type="file"/g)).toHaveLength(6);
  expect(admin).toContain("Preview packet");
  expect(admin).not.toContain("Activate validated packet");
  expect(admin).toContain("Omitted products are not zeroed.");
  expect(admin.toLowerCase()).toContain('autocomplete="off"');
});
