import { readFile, stat } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { auditZavodWorkbook } from "../lib/zavod-workbook-audit.mjs";
import { savePrivate } from "../lib/reconciliation-files.mjs";
async function main() {
  const args = process.argv.slice(2);
  if (args.length !== 1 && !(args.length === 3 && args[1] === "--out"))
    throw new Error("INVALID_ARGUMENTS");
  const path = resolve(args[0]);
  if ((await stat(path)).size > 15 * 1024 * 1024)
    throw new Error("WORKBOOK_TOO_LARGE");
  const reference = JSON.parse(
    await readFile(
      new URL(
        "../prisma/verification/38-zavod-reference.json",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  const report = auditZavodWorkbook(await readFile(path), reference);
  await savePrivate(
    resolve(args[2] ?? resolve(dirname(path), "workbook-audit.json")),
    report,
  );
  process.stdout.write(
    JSON.stringify({
      status: report.status,
      issueCount: report.issues.length,
    }) + "\n",
  );
  process.exitCode = 2;
}
main().catch(() => {
  process.stderr.write(
    JSON.stringify({ error: "INVALID_WORKBOOK_AUDIT_INPUT" }) + "\n",
  );
  process.exitCode = 1;
});
