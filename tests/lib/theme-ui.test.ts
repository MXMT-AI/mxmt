import { createElement } from "react";
import { expect, it } from "vitest";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { ThemeProvider, ThemeToggle } from "@/components/theme-provider/theme-provider";
import uk from "@/messages/uk.json";
import en from "@/messages/en.json";

it.each(["uk", "en"] as const)("renders an accessible stable theme placeholder during SSR in %s", locale => {
  const copy = locale === "uk" ? uk : en;
  const html = renderToStaticMarkup(createElement(ThemeProvider, {
    children: createElement(NextIntlClientProvider, {
      locale, messages: copy, timeZone: "Europe/Kyiv", children: createElement(ThemeToggle),
    }),
  }));
  expect(html).toContain(`role="combobox" aria-label="${copy.theme_label}"`);
  expect(html).toMatch(/<button[^>]*aria-expanded="false"[^>]*disabled=""/);
  expect(html).not.toContain('role="listbox"');
});
