import { isValidElement, useEffect, useState, type ReactNode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { getAgentProvider, loadAgentProviders } from "@/lib/client/agent-providers";
import AgentProvidersCard from "@/components/settings/agent-providers-card/agent-providers-card";
import { AgentProviderRow } from "@/components/settings/agent-provider-row/agent-provider-row";
import { AGENT_CONFIGS } from "@/components/settings/agent-providers-card/agent-provider-config";
vi.mock("react", async load => ({ ...await load<typeof import("react")>(), useEffect: vi.fn(), useState: vi.fn() }));
const getItem = vi.fn(), setItem = vi.fn(), dispatchEvent = vi.fn(), setProviders = vi.fn();
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("window", { dispatchEvent });
  vi.stubGlobal("localStorage", { getItem, setItem });
  getItem.mockReturnValue(null);
  vi.mocked(useState).mockReturnValue([{}, setProviders]);
});
afterEach(() => vi.unstubAllGlobals());
function nodes(node: ReactNode): { type: unknown; props: Record<string, any> }[] {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!isValidElement<{ children?: ReactNode }>(node)) return [];
  return [{ type: node.type, props: node.props }, ...nodes(node.props.children)];
}
it.each(["null", "[]", "42", '"anthropic"', "broken", '{"a":"invalid"}'])("falls back to OpenAI for invalid stored data %s", json => {
  getItem.mockReturnValue(json);
  expect(loadAgentProviders()).toEqual({});
  expect(getAgentProvider("inventory_analyst")).toBe("openai");
});
it("keeps valid choices while ignoring invalid values and inherited keys", () => {
  getItem.mockReturnValue('{"a":"anthropic","b":"openai","c":null}');
  expect(loadAgentProviders()).toEqual({ a: "anthropic", b: "openai" });
  expect(getAgentProvider("a")).toBe("anthropic");
  expect(getAgentProvider("toString")).toBe("openai");
});
it("loads safely during SSR or when browser storage is unavailable", () => {
  vi.stubGlobal("window", undefined);
  expect(getAgentProvider("a")).toBe("openai");
  vi.stubGlobal("window", {});
  getItem.mockImplementationOnce(() => { throw new Error("Blocked"); });
  expect(loadAgentProviders()).toEqual({});
});
it("loads stored preferences and persists one changed agent without losing other choices", () => {
  getItem.mockReturnValue('{"repricing":"anthropic"}');
  vi.mocked(useState).mockReturnValue([{ repricing: "anthropic" }, setProviders]);
  const tree = nodes(AgentProvidersCard());
  vi.mocked(useEffect).mock.lastCall![0]();
  expect(setProviders).toHaveBeenCalledWith({ repricing: "anthropic" });
  const rows = tree.filter(node => node.type === AgentProviderRow);
  expect(rows).toHaveLength(AGENT_CONFIGS.length);
  expect(rows.find(row => row.props.agent.id === "repricing")!.props.current).toBe("anthropic");
  rows[0].props.onChange("inventory_analyst", "anthropic");
  expect(setItem).toHaveBeenCalledWith("mxmt_agent_providers", JSON.stringify({ repricing: "anthropic", inventory_analyst: "anthropic" }));
  expect(dispatchEvent.mock.calls[0][0].type).toBe("mxmt_providers_changed");
  expect(getAgentProvider("missing")).toBe("openai");
});
it.each(["openai", "anthropic"] as const)("shows the %s model and marks only its button active", current => {
  const agent = AGENT_CONFIGS[0], onChange = vi.fn();
  const tree = nodes(AgentProviderRow({ agent, current, onChange }));
  expect(tree.some(node => node.props.children === agent.defaultModel[current])).toBe(true);
  const buttons = tree.filter(node => node.type === "button");
  expect(buttons.filter(button => button.props["aria-pressed"])).toHaveLength(1);
  expect(buttons.every(button => button.props.type === "button")).toBe(true);
  buttons.find(button => !button.props["aria-pressed"])!.props.onClick();
  expect(onChange).toHaveBeenCalledWith(agent.id, current === "openai" ? "anthropic" : "openai");
});
