import { useRef, useState } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useAuthSubmit } from "@/components/auth/use-auth-submit/use-auth-submit";

vi.mock("react", async load => ({ ...await load<typeof import("react")>(), useState: vi.fn(), useRef: vi.fn() }));
const fetcher = vi.fn(), setError = vi.fn(), setLoading = vi.fn(), onSuccess = vi.fn();
const payload = { email: "demo@example.test", password: "example-password" };

function start(endpoint: "/api/auth/login" | "/api/auth/register" = "/api/auth/login") {
  vi.mocked(useState).mockReturnValueOnce(["", setError]).mockReturnValueOnce([false, setLoading]);
  vi.mocked(useRef).mockReturnValueOnce({ current: false });
  return useAuthSubmit({ endpoint, fallbackError: "Try again", onSuccess });
}

beforeEach(() => {
  vi.clearAllMocks();
  fetcher.mockReset();
  vi.stubGlobal("fetch", fetcher);
});
afterEach(() => vi.unstubAllGlobals());

it.each(["/api/auth/login", "/api/auth/register"] as const)("posts JSON to %s and navigates only after success", async endpoint => {
  fetcher.mockResolvedValue(new Response(JSON.stringify({ ok: true })));
  await start(endpoint).submit(payload);
  expect(fetcher).toHaveBeenCalledWith(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
  expect(onSuccess).toHaveBeenCalledOnce();
  expect(setError.mock.calls).toEqual([[""]]);
  expect(setLoading.mock.calls).toEqual([[true], [false]]);
});

it("blocks duplicate submissions while the request is pending", async () => {
  let finish!: (response: Response) => void;
  fetcher.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const state = start();
  const pending = state.submit(payload);
  await state.submit(payload);
  expect(fetcher).toHaveBeenCalledOnce();
  expect(onSuccess).not.toHaveBeenCalled();
  finish(new Response(JSON.stringify({ ok: true })));
  await pending;
  expect(onSuccess).toHaveBeenCalledOnce();
});

it.each([
  { error: "Invalid credentials", expected: "Invalid credentials" },
  { error: { details: "Invalid" }, expected: "Try again" },
  { error: "", expected: "Try again" },
  { error: undefined, expected: "Try again" },
])("reports a safe error from $error and permits retry", async ({ error, expected }) => {
  fetcher.mockResolvedValueOnce(new Response(JSON.stringify({ error }), { status: 400 }));
  const state = start();
  await state.submit(payload);
  expect(onSuccess).not.toHaveBeenCalled();
  expect(setError).toHaveBeenLastCalledWith(expected);
  expect(setLoading).toHaveBeenLastCalledWith(false);
  fetcher.mockResolvedValueOnce(new Response(JSON.stringify({ ok: true })));
  await state.submit(payload);
  expect(setError).toHaveBeenLastCalledWith("");
  expect(onSuccess).toHaveBeenCalledOnce();
});

it.each(["network", "json"])("handles %s failures without navigating", async failure => {
  if (failure === "network") fetcher.mockRejectedValueOnce(new Error());
  else fetcher.mockResolvedValueOnce(new Response("not JSON", { status: 502 }));
  await start().submit(payload);
  expect(setError).toHaveBeenLastCalledWith("Try again");
  expect(setLoading).toHaveBeenLastCalledWith(false);
  expect(onSuccess).not.toHaveBeenCalled();
});
