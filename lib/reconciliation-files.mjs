import { writeFile, mkdir, rename, realpath } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import {
  basename,
  dirname,
  resolve,
  relative,
  isAbsolute,
  sep,
} from "node:path";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../", import.meta.url));
export async function savePrivate(path, value) {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const destination = resolve(await realpath(dirname(path)), basename(path));
  const local = relative(root, destination);
  if (
    !local.startsWith(`..${sep}`) &&
    local !== ".." &&
    !isAbsolute(local) &&
    !local.startsWith(`.local${sep}reconciliation${sep}`)
  )
    throw new Error("PUBLIC_REPOSITORY_OUTPUT_REFUSED");
  const temp = resolve(
    dirname(destination),
    `.reconciliation-${randomUUID()}.tmp`,
  );
  await writeFile(temp, JSON.stringify(value, null, 2) + "\n", {
    mode: 0o600,
    flag: "wx",
  });
  await rename(temp, destination);
}
