import { createElement } from "react";
import { expect, it } from "vitest";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { ThemeProvider } from "@/components/theme-provider/theme-provider";
import { LandingThemeSwitch } from "@/components/landing/landing-theme-switch/landing-theme-switch";
import uk from "@/messages/uk.json";
import en from "@/messages/en.json";

it.each(["uk", "en"] as const)("renders a neutral disabled landing switch during SSR in %s", locale => {
  const copy = locale === "uk" ? uk : en;
  const html = renderToStaticMarkup(createElement(ThemeProvider, {
    children: createElement(NextIntlClientProvider, {
      locale, messages: copy, timeZone: "Europe/Kyiv", children: createElement(LandingThemeSwitch),
    }),
  }));
  expect(html).toContain(`role="group" aria-label="${copy.theme_label}"`);
  expect(html.match(/aria-pressed="false"/g)).toHaveLength(3);
  expect(html.match(/disabled=""/g)).toHaveLength(3);
  expect(html).not.toContain("data-theme-choice=");
  expect(html.indexOf(`aria-label="${copy.theme_system}"`)).toBeLessThan(html.indexOf(`aria-label="${copy.theme_light}"`));
  expect(html.indexOf(`aria-label="${copy.theme_light}"`)).toBeLessThan(html.indexOf(`aria-label="${copy.theme_dark}"`));
});
