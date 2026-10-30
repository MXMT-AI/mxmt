import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
const [workbook, out, ...extra] = process.argv.slice(2);
if (!workbook || extra.length) {
  process.stderr.write(
    "Usage: npm run verify:reporting:offline -- /private/workbook.xlsx [/private/report.json]\n",
  );
  process.exit(1);
}
const result = spawnSync(
  process.execPath,
  [
    "node_modules/vitest/vitest.mjs",
    "run",
    "--maxWorkers=2",
    "tests/lib/reporting-offline-acceptance.test.ts",
    "tests/lib/sheets-projection-store.test.ts",
    "tests/lib/sheets-projection-compile.test.ts",
    "tests/lib/salesdrive-import.test.ts",
    "tests/lib/salesdrive-inventory.test.ts",
    "tests/lib/merchandising-screen-store.test.ts",
  ],
  {
    cwd: new URL("../", import.meta.url),
    env: {
      ...process.env,
      MXMT_OFFLINE_WORKBOOK: resolve(workbook),
      MXMT_OFFLINE_REPORT: resolve(
        out ?? "/tmp/mxmt-reporting-offline-evidence.json",
      ),
    },
    stdio: "inherit",
  },
);
process.exit(result.status ?? 1);
