import { afterEach, describe, expect, it } from "vitest";
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
  existsSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
const root = new URL("../../", import.meta.url).pathname;
const dirs: string[] = [];
function directory() {
  const path = mkdtempSync(resolve(tmpdir(), "mxmt-reconciliation-"));
  dirs.push(path);
  return path;
}
const run = (...args: string[]) =>
  spawnSync(
    process.execPath,
    [resolve(root, "scripts/reconcile-zavod.mjs"), ...args],
    { cwd: root, encoding: "utf8" },
  );
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});
describe("private offline reconciliation CLI", () => {
  it("emits a blocked readiness report without exposing values on stdout", () => {
    const output = resolve(directory(), "report with spaces #1.json");
    const result = run("--reference-only", "--out", output);
    expect(result.status).toBe(2);
    expect(JSON.parse(readFileSync(output, "utf8"))).toMatchObject({
      status: "BLOCKED",
      numericStatus: "BLOCKED",
    });
    expect(JSON.parse(result.stdout).blockerCount).toBeGreaterThan(0);
    expect(result.stdout).not.toContain("1156812");
    expect(statSync(output).mode & 0o777).toBe(0o600);
  });
  it("creates an unverified template and never overwrites an existing package", () => {
    const dir = directory();
    expect(run("--template", dir).status).toBe(0);
    const path = resolve(dir, "manifest.json"),
      manifest = JSON.parse(readFileSync(path, "utf8"));
    expect(manifest).toMatchObject({ origin: "UNVERIFIED", approvals: [] });
    expect(manifest.artifacts.reference.sha256).toMatch(/^[a-f0-9]{64}$/);
    manifest.approvals = [{ note: "preserve existing approval record" }];
    writeFileSync(path, JSON.stringify(manifest));
    expect(run("--template", dir).status).toBe(1);
    expect(JSON.parse(readFileSync(path, "utf8")).approvals).toEqual(
      manifest.approvals,
    );
    expect(run(path).status).toBe(2); // absent customer artifacts remain blocked
  });
  it("refuses customer reports in tracked repository directories", () => {
    const output = resolve(root, "prisma/verification/38-must-not-write.json");
    expect(run("--reference-only", "--out", output).status).toBe(1);
    expect(existsSync(output)).toBe(false);
  });
  it("does not print malformed private JSON or parser exception text", () => {
    const path = resolve(directory(), "invalid.json");
    writeFileSync(path, '{"customer-secret":private-financial-data}');
    const result = run(path);
    expect(result.status).toBe(1);
    expect(JSON.parse(result.stderr)).toEqual({
      error: "INVALID_RECONCILIATION_INPUT",
    });
    expect(result.stdout + result.stderr).not.toContain(
      "private-financial-data",
    );
  });
});
