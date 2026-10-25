import { savePrivate } from "../lib/reconciliation-files.mjs";
import { readFile, stat } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { reconcileZavod } from "../lib/zavod-reconciliation.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const referencePath = resolve(
  root,
  "prisma/verification/38-zavod-reference.json",
);
const kinds = [
  "reference",
  "sales",
  "daily",
  "settings",
  "source",
  "legacy",
  "alternative",
];
async function hashFile(path, limit = 512 * 1024 * 1024) {
  if ((await stat(path)).size > limit) throw new Error("INPUT_TOO_LARGE");
  const hash = createHash("sha256");
  for await (const part of createReadStream(path)) hash.update(part);
  return hash.digest("hex");
}
async function json(path) {
  if ((await stat(path)).size > 64 * 1024 * 1024)
    throw new Error("INPUT_TOO_LARGE");
  return JSON.parse(await readFile(path, "utf8"));
}
async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--help")) {
    process.stdout.write(
      "Usage: npm run reconcile:zavod -- --template <private-directory>\n       npm run reconcile:zavod -- <private-manifest.json> [--out <private-report.json>]\n       npm run reconcile:zavod -- --reference-only [--out <private-report.json>]\nExit codes: 0 accepted; 2 blocked/failed acceptance; 1 invalid input. No database/network access.\n",
    );
    return;
  }
  if (args[0] === "--template" && args.length === 2) {
    const directory = resolve(args[1]);
    for (const name of ["manifest.json", "reference.json"]) {
      try {
        await stat(resolve(directory, name));
        throw new Error("TEMPLATE_EXISTS");
      } catch (error) {
        if (error?.code !== "ENOENT") throw error;
      }
    }
    const reference = await json(referencePath);
    await savePrivate(resolve(directory, "reference.json"), reference);
    const template = {
      schemaVersion: 1,
      fixtureId: "zavod-september-2026",
      revision: 1,
      origin: "UNVERIFIED",
      scope: {
        sourceId: null,
        currency: "UAH",
        timezone: "Europe/Kyiv",
        stockDate: null,
      },
      artifacts: Object.fromEntries(
        kinds.map((kind) => [
          kind,
          {
            path: kind === "source" ? "source-evidence.zip" : `${kind}.json`,
            sha256: null,
          },
        ]),
      ),
      discrepancyExplanation: { cause: null, evidenceRef: null },
      approvals: [],
    };
    template.artifacts.reference.sha256 = await hashFile(
      resolve(directory, "reference.json"),
    );
    await savePrivate(resolve(directory, "manifest.json"), template);
    process.stdout.write(
      JSON.stringify({
        status: "TEMPLATE_CREATED",
        customerAcceptance: "NOT_RUN",
      }) + "\n",
    );
    return;
  }
  const referenceOnly = args[0] === "--reference-only";
  if (
    !args[0] ||
    (args.length !== 1 && !(args.length === 3 && args[1] === "--out"))
  )
    throw new Error("INVALID_ARGUMENTS");
  const manifestPath = referenceOnly ? null : resolve(args[0]);
  const manifest = manifestPath ? await json(manifestPath) : {};
  const input = {
    manifest,
    reference: await json(referencePath),
    artifactHashes: {},
  };
  if (manifestPath) {
    for (const kind of kinds) {
      const artifact = manifest.artifacts?.[kind];
      if (!artifact) continue;
      if (
        typeof artifact.path !== "string" ||
        !artifact.path ||
        artifact.path.length > 4096
      )
        throw new Error("INVALID_ARTIFACT_PATH");
      const path = resolve(dirname(manifestPath), artifact.path);
      try {
        if (kind === "source")
          input.artifactHashes[kind] = await hashFile(path);
        else {
          if ((await stat(path)).size > 64 * 1024 * 1024)
            throw new Error("INPUT_TOO_LARGE");
          const bytes = await readFile(path);
          input.artifactHashes[kind] = createHash("sha256")
            .update(bytes)
            .digest("hex");
          input[kind] = JSON.parse(bytes.toString("utf8"));
        }
      } catch (error) {
        if (error?.code !== "ENOENT") throw error;
      }
    }
  }
  const report = reconcileZavod(input);
  const out = resolve(
    args[2] ??
      (manifestPath
        ? resolve(dirname(manifestPath), "reconciliation-report.json")
        : resolve(root, ".local/reconciliation/readiness.json")),
  );
  await savePrivate(out, report);
  // Reports are private by default. Do not print raw records, financial values or exception messages.
  process.stdout.write(
    JSON.stringify({
      status: report.status,
      numericStatus: report.numericStatus,
      blockerCount: report.blockers.length,
    }) + "\n",
  );
  if (report.status !== "PASS") process.exitCode = 2;
}
main().catch(() => {
  process.stderr.write(
    JSON.stringify({ error: "INVALID_RECONCILIATION_INPUT" }) + "\n",
  );
  process.exitCode = 1;
});
