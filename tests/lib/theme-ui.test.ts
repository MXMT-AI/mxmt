import { createElement } from "react";
import { expect, it } from "vitest";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { ThemeProvider, ThemeToggle } from "@/components/ThemeProvider";
import uk from "@/messages/uk.json";
import en from "@/messages/en.json";

it.each(["uk", "en"] as const)("renders an accessible stable theme placeholder during SSR in %s", locale => {
  const copy = locale === "uk" ? uk : en;
  const html = renderToStaticMarkup(createElement(ThemeProvider, {
    children: createElement(NextIntlClientProvider, {
      locale, messages: copy, timeZone: "Europe/Kyiv", children: createElement(ThemeToggle),
    }),
  }));
  expect(html).toContain(`<span class="sr-only">${copy.theme_label}</span>`);
  expect(html).toMatch(/<select[^>]*disabled=""/);
  expect(html).toMatch(/<option value=""[^>]*selected=""/);
  expect(html).not.toMatch(/<option value="(?:light|dark|system)"[^>]*selected=""/);
  for (const label of [copy.theme_light, copy.theme_dark, copy.theme_system]) expect(html).toContain(label);
});
