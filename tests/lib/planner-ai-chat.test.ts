import { createElement, isValidElement, useEffect, useRef, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
import { PlannerAiChat } from "@/components/planner/planner-ai-chat/planner-ai-chat";
import { Button } from "@/components/ui/button/button";
vi.mock("react", async load => ({ ...await load<typeof import("react")>(), useEffect: vi.fn(), useRef: vi.fn() }));
const props = { messages: [], input: "Question", loading: false, onInputChange: vi.fn(), onSend: vi.fn() };
function nodes(node: ReactNode): { type: unknown; props: Record<string, any> }[] {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!isValidElement<{ children?: ReactNode }>(node)) return [];
  return [{ type: node.type, props: node.props }, ...nodes(node.props.children)];
}
beforeEach(() => { vi.clearAllMocks(); vi.mocked(useRef).mockReturnValue({ current: null }); });
it("uses a single form submit for the submit button and native Enter submission", () => {
  const tree = nodes(PlannerAiChat(props));
  const button = tree.find(node => node.type === Button)!;
  expect(button.props.type).toBe("submit");
  expect(button.props.onClick).toBeUndefined();
  expect(tree.find(node => node.type === "input")!.props.onKeyDown).toBeUndefined();
  const preventDefault = vi.fn();
  tree.find(node => node.type === "form")!.props.onSubmit({ preventDefault });
  expect(preventDefault).toHaveBeenCalledOnce();
  expect(props.onSend).toHaveBeenCalledOnce();
});
it.each([{ input: "   ", loading: false }, { input: "Question", loading: true }])("blocks sending with $input and loading=$loading", overrides => {
  const tree = nodes(PlannerAiChat({ ...props, ...overrides }));
  expect(tree.find(node => node.type === Button)!.props.disabled).toBe(true);
  tree.find(node => node.type === "form")!.props.onSubmit({ preventDefault: vi.fn() });
  expect(props.onSend).not.toHaveBeenCalled();
});
it("labels input and send controls and forwards edits", () => {
  const tree = nodes(PlannerAiChat(props));
  const field = tree.find(node => node.type === "input")!;
  expect(field.props["aria-label"]).toBeTruthy();
  expect(tree.find(node => node.type === Button)!.props["aria-label"]).toBeTruthy();
  field.props.onChange({ target: { value: "New question" } });
  expect(props.onInputChange).toHaveBeenCalledWith("New question");
});
it("renders the empty prompts, accessible log and pending status", () => {
  const html = renderToStaticMarkup(createElement(PlannerAiChat, { ...props, loading: true }));
  expect(html).toContain('role="log"');
  expect(html).toContain('role="status"');
  expect(html).toContain("Thinking…");
  expect(html).toContain("Які товари пріоритетні для закупки?");
  expect(html).toMatch(/<input[^>]*disabled=""/);
});
it("escapes user and assistant messages and scrolls when history changes", () => {
  const scrollIntoView = vi.fn();
  vi.mocked(useRef).mockReturnValue({ current: { scrollIntoView } });
  const messages = [{ role: "user" as const, content: "<script>bad()</script>" }, { role: "assistant" as const, content: "Answer" }];
  const html = renderToStaticMarkup(createElement(PlannerAiChat, { ...props, messages }));
  expect(html).toContain("&lt;script&gt;");
  expect(html).not.toContain("<script>");
  expect(html).toContain("Answer");
  expect(html).not.toContain("Які товари пріоритетні для закупки?");
  vi.mocked(useEffect).mock.lastCall![0]();
  expect(scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth" });
  expect(vi.mocked(useEffect).mock.lastCall![1]).toEqual([messages]);
});
