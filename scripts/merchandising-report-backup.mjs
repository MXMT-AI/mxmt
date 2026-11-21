import { createHash } from "node:crypto";
import { lstat, mkdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { dirname, basename, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const backupIndex = "publication-backup.json";
const screens = ["overview", "sales", "stock", "repricing", "reordering"];
const reports = [...screens, "repricing-inputs", "repricing-preview", "reordering-preview"];
const inputTables = [
  "MerchandisingScreenFact", "MerchandisingScreenSku", "SkuDaily",
  "InventorySnapshot", "DataImportRun", "MerchandisingConfig",
];
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const contains = (parent, path) => {
  const suffix = relative(parent, path);
  return suffix === "" || !(suffix === ".." || suffix.startsWith(".." + sep));
};

async function readLocalFile(root, path) {
  const file = join(root, path);
  const canonical = await realpath(file);
  if (!contains(root, canonical) || canonical !== file || !(await lstat(file)).isFile())
    throw new Error(`Expected a regular local file at ${path}`);
  return readFile(file);
}

async function readPublication(root, tenantHash) {
  const namespace = `merchandising/v1/${tenantHash}`;
  const manifestPath = `${namespace}/active.json`;
  const manifest = await readLocalFile(root, manifestPath);
  const active = JSON.parse(manifest.toString("utf8"));
  const files = new Map();
  for (const version of [active, active.previous].filter(Boolean)) {
    if (!/^[a-f0-9-]{36}$/.test(version.version) ||
        typeof version.snapshotId !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(version.asOf))
      throw new Error("Invalid publication version");
    if (version.dataVersion !== undefined && version.dataVersion !== 1)
      throw new Error("Unsupported publication data version");

    for (const kind of version.dataVersion === 1 ? [...reports, "data"] : reports) {
      const path = `${namespace}/${version.version}/${kind}.json`;
      const bytes = await readLocalFile(root, path);
      const report = JSON.parse(bytes.toString("utf8"));
      if (kind === "data") {
        if (!inputTables.every((table) => typeof report?.[table] === "string"))
          throw new Error(`Incomplete inputs at ${path}`);
      } else {
        const matches = screens.includes(kind)
          ? report?.screen === kind && report.context?.snapshotId === version.snapshotId
          : report?.snapshotId === version.snapshotId;
        if (!matches) throw new Error(`Report does not match publication at ${path}`);
      }
      files.set(path, bytes);
    }
  }
  // The active pointer is installed only after all referenced files have been written.
  files.set(manifestPath, manifest);
  return { active, files };
}

async function run(action, tenantId, sourceDirectory, outputDirectory) {
  const source = await realpath(sourceDirectory);
  const output = resolve(outputDirectory);
  const target = join(await realpath(dirname(output)), basename(output));
  const publicDirectory = await realpath(fileURLToPath(new URL("../public", import.meta.url)));
  if (contains(publicDirectory, target) || contains(source, target))
    throw new Error("Choose a private destination outside the source and public directories");

  const tenantHash = sha256(tenantId);
  const { active, files } = await readPublication(source, tenantHash);
  const checksums = Object.fromEntries([...files].map(([path, bytes]) => [path, sha256(bytes)]));
  if (action === "restore") {
    const index = JSON.parse((await readLocalFile(source, backupIndex)).toString("utf8"));
    if (index.version !== 1 || index.tenantHash !== tenantHash ||
        Object.keys(index.checksums ?? {}).length !== files.size ||
        Object.entries(checksums).some(([path, hash]) => index.checksums?.[path] !== hash))
      throw new Error("Backup verification failed");
  }

  await mkdir(target, { mode: 0o700 });
  try {
    for (const [path, bytes] of files) {
      const file = join(target, path);
      await mkdir(dirname(file), { recursive: true, mode: 0o700 });
      await writeFile(file, bytes, { flag: "wx", mode: 0o600 });
    }
    if (action === "backup")
      await writeFile(join(target, backupIndex), JSON.stringify({
        version: 1, tenantHash, checksums,
      }, null, 2) + "\n", { flag: "wx", mode: 0o600 });
  } catch (error) {
    await rm(target, { recursive: true, force: true });
    throw error;
  }

  process.stdout.write(JSON.stringify({
    directory: target,
    activeAsOf: active.asOf,
    previousAsOf: active.previous?.asOf ?? null,
    files: files.size,
  }) + "\n");
}

const [action, tenantId, source, destination, ...extra] = process.argv.slice(2);
try {
  if (!["backup", "restore"].includes(action) || !tenantId || !source || !destination || extra.length)
    throw new Error("Usage: npm run reports:backup -- <backup|restore> <tenant-id> <source-dir> <new-dir>");
  await run(action, tenantId, source, destination);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
