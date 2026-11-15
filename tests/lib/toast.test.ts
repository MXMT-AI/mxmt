import { createElement, useEffect, useRef, useState } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useToast } from "@/components/ui/toast/use-toast";
import { Toast } from "@/components/ui/toast/toast";
vi.mock("react", async load => ({ ...await load<typeof import("react")>(), useState: vi.fn(), useRef: vi.fn(), useEffect: vi.fn(), useCallback: (callback: unknown) => callback }));
const setMessage = vi.fn();
function start() {
  vi.mocked(useState).mockReturnValueOnce([null, setMessage]);
  vi.mocked(useRef).mockReturnValueOnce({ current: undefined });
  return useToast();
}
beforeEach(() => { vi.clearAllMocks(); vi.useFakeTimers(); });
afterEach(() => vi.useRealTimers());
it.each(["Second", "First"])("gives the latest message a full three seconds: %s", text => {
  const toast = start();
  toast.showToast("First");
  vi.advanceTimersByTime(2000);
  toast.showToast(text);
  expect(setMessage.mock.calls).toEqual([["First"], [text]]);
  vi.advanceTimersByTime(2999);
  expect(setMessage).not.toHaveBeenCalledWith(null);
  vi.advanceTimersByTime(1);
  expect(setMessage).toHaveBeenLastCalledWith(null);
  expect(vi.getTimerCount()).toBe(0);
});
it("cleans up the timeout without changing state after unmount", () => {
  const toast = start();
  const cleanup = vi.mocked(useEffect).mock.lastCall![0]();
  toast.showToast("Message");
  cleanup?.();
  expect(vi.getTimerCount()).toBe(0);
  vi.advanceTimersByTime(3000);
  expect(setMessage.mock.calls).toEqual([["Message"]]);
});
it("keeps an empty live region mounted and renders escaped message text inside it", () => {
  expect(renderToStaticMarkup(createElement(Toast, { message: null }))).toBe('<div role="status" aria-atomic="true" class="fixed bottom-5 right-5 z-50"></div>');
  const html = renderToStaticMarkup(createElement(Toast, { message: "<script>text</script>" }));
  expect(html).toContain('role="status"');
  expect(html).toContain("&lt;script&gt;text&lt;/script&gt;");
  expect(html).not.toContain("<script>");
});
