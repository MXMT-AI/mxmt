import { isValidElement, useRef, useState, type ReactNode } from "react";
import { beforeEach, expect, it, vi } from "vitest";
import { apiFetch } from "@/lib/fetch";
import PrimaryBrandCreator from "@/components/settings/primary-brand-creator/primary-brand-creator";
import { Button } from "@/components/ui/button/button";
vi.mock("react", async load => ({ ...await load<typeof import("react")>(), useRef: vi.fn(), useState: vi.fn() }));
vi.mock("@/lib/fetch", () => ({ apiFetch: vi.fn() }));
const setName = vi.fn(), setBusy = vi.fn(), setError = vi.fn(), setSaved = vi.fn(), onCreated = vi.fn(), focus = vi.fn();
function nodes(node: ReactNode): { type: unknown; props: Record<string, any> }[] {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!isValidElement<{ children?: ReactNode }>(node)) return [];
  return [{ type: node.type, props: node.props }, ...nodes(node.props.children)];
}
function start(name = "Demo", disabled = false) {
  vi.mocked(useState).mockReturnValueOnce([name, setName]).mockReturnValueOnce([false, setBusy])
    .mockReturnValueOnce(["", setError]).mockReturnValueOnce([false, setSaved]);
  vi.mocked(useRef).mockReturnValueOnce({ current: { focus } }).mockReturnValueOnce({ current: false });
  const tree = nodes(PrimaryBrandCreator({ lang: "en", disabled, onCreated }));
  return { create: tree.find(node => node.type === Button)!.props.onClick, input: tree.find(node => node.type === "input")!.props };
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(apiFetch).mockImplementation(async () => new Response(JSON.stringify({ id: "brand", name: "Demo" })));
});
it("creates and selects the brand then clears the draft", async () => {
  await start().create();
  expect(apiFetch).toHaveBeenCalledWith("/api/settings/merchandising", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "createBrand", name: "Demo" }),
  });
  expect(onCreated).toHaveBeenCalledWith({ id: "brand", name: "Demo" });
  expect(setName).toHaveBeenCalledWith("");
  expect(setSaved).toHaveBeenLastCalledWith(true);
  expect(setBusy).toHaveBeenLastCalledWith(false);
});
it.each([["", false], ["   ", false], ["Demo", true]] as const)("blocks invalid or disabled creation via click and Enter (%s, %s)", async (name, disabled) => {
  const { create, input } = start(name, disabled), preventDefault = vi.fn();
  await create();
  input.onKeyDown({ key: "Enter", preventDefault });
  expect(preventDefault).toHaveBeenCalledOnce();
  expect(apiFetch).not.toHaveBeenCalled();
});
it("prevents a second request before React applies the busy state", async () => {
  let finish!: (value: Response) => void;
  vi.mocked(apiFetch).mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
  const { create, input } = start();
  const pending = create();
  input.onKeyDown({ key: "Enter", preventDefault: vi.fn() });
  await create();
  expect(apiFetch).toHaveBeenCalledOnce();
  finish(new Response(JSON.stringify({ id: "brand", name: "Demo" })));
  await pending;
  expect(onCreated).toHaveBeenCalledOnce();
});
it("preserves the draft and focuses its field after failure, then permits retry", async () => {
  vi.mocked(apiFetch).mockResolvedValueOnce(new Response("{}", { status: 400 }));
  const { create } = start();
  await create();
  expect(focus).toHaveBeenCalledOnce();
  expect(setError).toHaveBeenLastCalledWith("Could not create the brand. Check its name and try again.");
  expect(setName).not.toHaveBeenCalled();
  expect(onCreated).not.toHaveBeenCalled();
  await create();
  expect(onCreated).toHaveBeenCalledOnce();
});
