import { isValidElement, useLayoutEffect, useRef, type ReactNode } from "react";
import { beforeEach, expect, it, vi } from "vitest";
import { Dialog } from "@/components/ui/dialog/dialog";
import { Button } from "@/components/ui/button/button";
import { Heading } from "@/components/ui/heading/heading";
vi.mock("react", async load => ({ ...await load<typeof import("react")>(), useId: () => "dialog-title", useRef: vi.fn(), useLayoutEffect: vi.fn() }));
const showModal = vi.fn(), close = vi.fn(), onClose = vi.fn();
function nodes(node: ReactNode): { type: unknown; props: Record<string, any> }[] {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!isValidElement<{ children?: ReactNode }>(node)) return [];
  return [{ type: node.type, props: node.props }, ...nodes(node.props.children)];
}
function render(closeDisabled = false) {
  return Dialog({ title: "Confirm import", closeLabel: "Close", closeDisabled, onClose, children: "Content" });
}
beforeEach(() => { vi.clearAllMocks(); vi.mocked(useRef).mockReturnValue({ current: { showModal, close } }); });
it("opens the native dialog and closes it before unmount without firing a user-close action", () => {
  render();
  const cleanup = vi.mocked(useLayoutEffect).mock.lastCall![0]();
  expect(showModal).toHaveBeenCalledOnce();
  cleanup?.();
  expect(close).toHaveBeenCalledOnce();
  expect(onClose).not.toHaveBeenCalled();
});
it.each([false, true])("applies closeDisabled=%s to Escape, backdrop and close-button actions", closeDisabled => {
  const dialog = render(closeDisabled), button = nodes(dialog).find(node => node.type === Button)!.props;
  const preventDefault = vi.fn();
  dialog.props.onCancel({ preventDefault });
  expect(preventDefault).toHaveBeenCalledOnce();
  const backdrop = {};
  dialog.props.onClick({ currentTarget: backdrop, target: backdrop });
  button.onClick();
  expect(onClose).toHaveBeenCalledTimes(closeDisabled ? 0 : 3);
  dialog.props.onClick({ currentTarget: backdrop, target: {} });
  expect(onClose).toHaveBeenCalledTimes(closeDisabled ? 0 : 3);
  expect(button.disabled).toBe(closeDisabled);
  expect(button.autoFocus).toBe(true);
  expect(button["aria-label"]).toBe("Close");
  expect(nodes(dialog).find(node => node.type === Heading)!.props.id).toBe(dialog.props["aria-labelledby"]);
});
