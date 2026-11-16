import { createElement, isValidElement, useEffect, useState, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import AIProviderCard from "@/components/settings/ai-provider-card/ai-provider-card";
vi.mock("react", async load => ({ ...await load<typeof import("react")>(), useState: vi.fn(), useEffect: vi.fn() }));
const setActive = vi.fn();
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useState).mockReturnValue(["openai", setActive]);
  vi.stubGlobal("document", { cookie: "" });
});
afterEach(() => vi.unstubAllGlobals());
function nodes(node: ReactNode): { type: unknown; props: Record<string, any> }[] {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!isValidElement<{ children?: ReactNode }>(node)) return [];
  return [{ type: node.type, props: node.props }, ...nodes(node.props.children)];
}
it.each(["openai", "anthropic"])("restores valid %s cookie among other cookies", provider => {
  document.cookie = `session=demo; ai_provider=${provider}; theme=dark`;
  AIProviderCard({ lang: "en" });
  vi.mocked(useEffect).mock.lastCall![0]();
  expect(setActive).toHaveBeenCalledWith(provider);
});
it.each(["", "ai_provider=invalid", "not_ai_provider=anthropic"])("keeps the default for missing or invalid cookie %s", cookie => {
  document.cookie = cookie;
  AIProviderCard({ lang: "uk" });
  vi.mocked(useEffect).mock.lastCall![0]();
  expect(useState).toHaveBeenCalledWith("openai");
  expect(setActive).not.toHaveBeenCalled();
});
it("persists a manual choice with the existing cookie options", () => {
  const tree = nodes(AIProviderCard({ lang: "en" }));
  const buttons = tree.filter(node => node.type === "button");
  expect(buttons.map(button => button.props["aria-pressed"])).toEqual([false, true]);
  expect(buttons.every(button => button.props.type === "button")).toBe(true);
  buttons[0].props.onClick();
  expect(setActive).toHaveBeenCalledWith("anthropic");
  expect(document.cookie).toBe("ai_provider=anthropic;path=/;max-age=31536000;samesite=lax");
});
it.each(["uk", "en"] as const)("renders localized descriptions and one active badge in %s", lang => {
  const html = renderToStaticMarkup(createElement(AIProviderCard, { lang }));
  expect(html).toContain(lang === "en" ? "Active model" : "Активна модель");
  expect(html).toContain(lang === "en" ? "Default provider for all agents" : "Провайдер за замовчуванням для всіх агентів");
  expect(html.match(/aria-pressed="true"/g)).toHaveLength(1);
  expect(html).toContain(lang === "en" ? "Choice is saved in the browser" : "Вибір зберігається в браузері");
  if (lang === "en") expect(html).not.toContain("Доступний лише");
});
