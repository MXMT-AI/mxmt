import { afterEach, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";
vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({ lookup: vi.fn(), request: vi.fn() }));
vi.mock("node:dns/promises", () => ({
  lookup: (...args: unknown[]) => state.lookup(...args),
}));
vi.mock("node:https", () => ({
  request: (...args: unknown[]) => state.request(...args),
}));
import {
  horoshopFetch,
  resolveShop,
} from "@/lib/connectors/horoshop/transport";
afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
  vi.clearAllMocks();
});
it("pins a checked DNS address to the HTTPS socket and never follows redirects or forwards extra headers", async () => {
  vi.stubEnv("HOROSHOP_ALLOWED_ORIGINS", "https://shop.example.com");
  state.lookup.mockResolvedValue([{ address: "8.8.8.8", family: 4 }]);
  state.request.mockImplementation((url, options, callback) => {
    expect(url.hostname).toBe("shop.example.com");
    expect(options.agent).toBe(false);
    expect(options.rejectUnauthorized).not.toBe(false);
    expect(options.headers).not.toHaveProperty("Authorization");
    const all = vi.fn(),
      single = vi.fn();
    options.lookup(url.hostname, { all: true }, all);
    options.lookup(url.hostname, {}, single);
    expect(all).toHaveBeenCalledWith(null, [{ address: "8.8.8.8", family: 4 }]);
    expect(single).toHaveBeenCalledWith(null, "8.8.8.8", 4);
    const req = new EventEmitter() as any;
    req.end = () => {
      const res = new EventEmitter() as any;
      res.statusCode = 302;
      res.headers = { location: "https://127.0.0.1/", "retry-after": "120" };
      callback(res);
      res.emit("data", Buffer.from("{}"));
      res.emit("end");
    };
    return req;
  });
  const result = await horoshopFetch(
    new URL("https://shop.example.com/api/auth/"),
    {
      method: "POST",
      body: "{}",
      headers: { Authorization: "do-not-forward" },
    },
  );
  expect(result.status).toBe(302);
  expect(state.request).toHaveBeenCalledTimes(1);
  expect(state.lookup).toHaveBeenCalledTimes(1);
});
it("blocks private and rebinding DNS answers before opening any socket", async () => {
  vi.stubEnv("HOROSHOP_ALLOWED_ORIGINS", "https://shop.example.com");
  for (const answers of [
    [{ address: "169.254.169.254", family: 4 }],
    [
      { address: "8.8.8.8", family: 4 },
      { address: "::ffff:127.0.0.1", family: 6 },
    ],
  ]) {
    state.lookup.mockResolvedValue(answers);
    await expect(
      horoshopFetch(new URL("https://shop.example.com/api/auth/"), {
        method: "POST",
        body: "{}",
      }),
    ).rejects.toMatchObject({ code: "NOT_CONFIGURED" });
  }
  expect(state.request).not.toHaveBeenCalled();
});
it.each([
  "https://evil.example.com/api/auth/",
  "https://shop.example.com/api/orders/update/",
  "https://shop.example.com/api/auth/?token=secret",
])("rejects unapproved origin/function/URL before DNS: %s", async (url) => {
  vi.stubEnv("HOROSHOP_ALLOWED_ORIGINS", "https://shop.example.com");
  await expect(
    horoshopFetch(new URL(url), { method: "POST", body: "{}" }),
  ).rejects.toMatchObject({ code: "NOT_CONFIGURED" });
  expect(state.lookup).not.toHaveBeenCalled();
});
it("bounds slow DNS resolution", async () => {
  vi.useFakeTimers();
  state.lookup.mockImplementation(() => new Promise(() => {}));
  const result = expect(resolveShop("shop.example.com")).rejects.toMatchObject({
    code: "TIMEOUT",
  });
  await vi.advanceTimersByTimeAsync(8000);
  await result;
});
