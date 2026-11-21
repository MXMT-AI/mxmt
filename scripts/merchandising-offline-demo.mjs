import { spawn, spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { once } from "node:events";
import { access, mkdtemp, readFile, readdir, rename, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { hash } from "bcryptjs";
import { seedDemoAgentData } from "./merchandising-demo-agents.mjs";

const project = fileURLToPath(new URL("../", import.meta.url));
const host = "127.0.0.1";
const email = "presenter@mxmt.test";

async function prepareLoginDatabase(db, tenantId, password, role) {
  const migrations = join(project, "prisma/migrations");
  for (const name of (await readdir(migrations, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort())
    await db.exec(await readFile(join(migrations, name, "migration.sql"), "utf8"));

  await db.query(
    `INSERT INTO "Tenant" (id,name,slug,"updatedAt") VALUES ($1,$2,'offline-demonstration',now())`,
    [tenantId, "MXMT Analytics — локальна репетиція"],
  );
  await db.query(
    `INSERT INTO "User" (id,email,"passwordHash",name,role,"tenantId","updatedAt")
      VALUES ('offline-presenter',$1,$2,'Ведучий',$4::"Role",$3,now())`,
    [email, await hash(password, 10), tenantId, role],
  );
}

async function openDemoDatabase(tenantId, password, databasePath, fixture, checksum) {
  if (!fixture) {
    const db = new PGlite();
    try {
      await prepareLoginDatabase(db, tenantId, password, "VIEWER");
      return db;
    } catch (error) {
      await db.close();
      throw error;
    }
  }

  const exists = await access(databasePath).then(() => true, (error) => {
    if (error.code === "ENOENT") return false;
    throw error;
  });
  if (!exists) {
    const stage = await mkdtemp(join(dirname(databasePath), ".la310-stage-"));
    try {
      const initial = new PGlite(stage);
      try {
        await prepareLoginDatabase(initial, tenantId, password, "ANALYST");
        await seedDemoAgentData(initial, tenantId, fixture, checksum);
      } finally {
        await initial.close();
      }
      await rename(stage, databasePath);
    } finally {
      await rm(stage, { recursive: true, force: true });
    }
  }

  const db = new PGlite(databasePath);
  try {
    await db.query(`UPDATE "User" SET "passwordHash"=$1,"updatedAt"=now()
      WHERE id='offline-presenter' AND "tenantId"=$2`, [await hash(password, 10), tenantId]);
    return db;
  } catch (error) {
    await db.close();
    throw error;
  }
}

async function run(tenantId, backup, port, fixturePath) {
  await access(join(project, ".next/BUILD_ID"));
  const runtime = await mkdtemp(join(tmpdir(), "mxmt-demo-"));
  const password = process.env.MXMT_REHEARSAL_PASSWORD ?? randomBytes(18).toString("base64url");
  let db;
  let socket;
  let server;
  let stop;
  let stopping = false;
  try {
    const reports = join(runtime, "reports");
    const restoration = spawnSync(process.execPath, [
      join(project, "scripts/merchandising-report-backup.mjs"),
      "restore", tenantId, resolve(backup), reports,
    ], { encoding: "utf8" });
    if (restoration.status !== 0) throw new Error(restoration.stderr || "Could not restore backup");

    const tenantHash = createHash("sha256").update(tenantId).digest("hex");
    const manifest = JSON.parse(await readFile(
      join(reports, "merchandising/v1", tenantHash, "active.json"), "utf8",
    ));
    if (manifest.dataVersion !== 1)
      throw new Error("Republish the snapshot with filter and scenario inputs before making the backup");

    const fixtureText = fixturePath ? await readFile(resolve(fixturePath), "utf8") : null;
    const fixture = fixtureText ? JSON.parse(fixtureText) : null;
    const checksum = fixtureText && createHash("sha256").update(fixtureText).digest("hex");
    if (fixture && (fixture.version !== "LA-310" || fixture.synthetic !== true ||
      fixture.asof !== manifest.asOf || fixture.asof !== manifest.dateTo ||
      !Array.isArray(fixture.products) || !Array.isArray(fixture.events)))
      throw new Error("Expected the synthetic LA-310 fixture matching the published report date");
    const databasePath = join(dirname(resolve(backup)), `.la310-agents-${tenantHash.slice(0, 10)}-${checksum?.slice(0, 12)}`);
    db = await openDemoDatabase(tenantId, password, databasePath, fixture, checksum);
    socket = new PGLiteSocketServer({
      db, path: join(runtime, ".s.PGSQL.5432"), maxConnections: 1,
    });
    await socket.start();

    // Give Next its built files and static assets in a directory without the project's .env files.
    for (const entry of [".next", "node_modules", "public"])
      await symlink(join(project, entry), join(runtime, entry), "dir");
    const database = new URL("postgresql://postgres@localhost/postgres");
    database.searchParams.set("host", runtime);
    database.searchParams.set("connection_limit", "1");
    const url = `http://${host}:${port}`;
    const loginFile = join(runtime, "login.txt");
    await writeFile(loginFile, `URL: ${url}/uk/login?next=%2Fuk%2Foverview\nEmail: ${email}\nПароль: ${password}\n`, {
      flag: "wx", mode: 0o600,
    });

    server = spawn(process.execPath, [
      join(project, "node_modules/next/dist/bin/next"),
      "start", runtime, "-p", String(port), "-H", host,
    ], {
      cwd: runtime,
      stdio: "inherit",
      env: {
        PATH: process.env.PATH,
        NODE_ENV: "production",
        NEXT_TELEMETRY_DISABLED: "1",
        DATABASE_URL: database.href,
        DIRECT_URL: database.href,
        JWT_ACCESS_SECRET: randomBytes(32).toString("hex"),
        JWT_REFRESH_SECRET: randomBytes(32).toString("hex"),
        MERCHANDISING_PUBLICATION_DIR: reports,
        MERCHANDISING_PUBLISHED_TENANTS: tenantId,
        NEXT_PUBLIC_APP_URL: url,
        LEGACY_NAVIGATION_ENABLED: "false",
        ...(fixture && {
          MXMT_DEMO_AGENT_DATE: manifest.asOf,
          OPENAI_API_KEY: process.env.OPENAI_API_KEY,
        }),
      },
    });
    stop = () => {
      stopping = true;
      server.kill("SIGTERM");
    };
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
    process.stdout.write(`Локальна репетиція за ${manifest.asOf}: ${url}/uk/login?next=%2Fuk%2Foverview\nДані входу: ${loginFile}\n`);
    const [code, signal] = await once(server, "exit");
    if (!stopping && code !== 0 && signal !== "SIGTERM" && signal !== "SIGINT")
      throw new Error(`Offline Next server exited with status ${code ?? signal}`);
  } finally {
    if (stop) {
      process.removeListener("SIGINT", stop);
      process.removeListener("SIGTERM", stop);
    }
    try {
      if (socket) {
        await socket.stop();
        // The socket server can still be detaching a PGlite handler.
        // Sync the persisted demo database and let the owning process exit.
        if (fixturePath) await db.syncToFs();
      } else if (db) {
        await db.close();
      }
    } finally {
      await rm(runtime, { recursive: true, force: true });
    }
  }
}

const [tenantId, backup, port = "3112", fixturePath, ...extra] = process.argv.slice(2);
try {
  if (!tenantId || !backup || extra.length || !/^\d+$/.test(port) ||
      Number(port) < 1024 || Number(port) > 65535)
    throw new Error("Usage: npm run reports:demo -- <tenant-id> <backup-dir> [port] [LA-310.json]");
  await run(tenantId, backup, Number(port), fixturePath);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
