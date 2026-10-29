import {spawnSync} from "node:child_process";
import {createRequire} from "node:module";
import {resolve} from "node:path";
import {pathToFileURL} from "node:url";

const require=createRequire(import.meta.url);

/** Never check a different Neon database from the one the application will read. */
export function validateDatabaseTarget(env){
  let runtime,direct;
  try{runtime=new URL(env.DATABASE_URL);direct=new URL(env.DIRECT_URL);}
  catch{throw new Error("DATABASE_URL and DIRECT_URL must both be configured PostgreSQL URLs.");}
  if(![runtime,direct].every(url=>["postgres:","postgresql:"].includes(url.protocol)))
    throw new Error("DATABASE_URL and DIRECT_URL must use PostgreSQL.");
  const host=url=>url.hostname.endsWith(".neon.tech")?url.hostname.replace(/-pooler(?=\.)/,""):url.hostname;
  const schema=url=>url.searchParams.get("schema")??"public";
  // Prisma uses the host query parameter for Unix sockets; reject ambiguous repeats.
  const socket=url=>url.searchParams.get("host");
  if([runtime,direct].some(url=>url.searchParams.getAll("host").length>1)||socket(runtime)!==socket(direct)||host(runtime)!==host(direct)||(runtime.port||"5432")!==(direct.port||"5432")||runtime.pathname!==direct.pathname||schema(runtime)!==schema(direct))
    throw new Error("DATABASE_URL and DIRECT_URL must target the same database and schema.");
  if(direct.hostname.endsWith(".neon.tech")&&direct.hostname.includes("-pooler."))
    throw new Error("DIRECT_URL must use the direct Neon endpoint, without -pooler.");
}

/**
 * Startup/deployment only inspect migration history; applying migrations is a separate release step.
 * @param {string} mode
 * @param {{env?: Record<string, string|undefined>, run?: (tool: "prisma"|"next", args: string[]) => number, log?: (message: string) => void}} [options]
 */
export function runDatabaseLifecycle(mode,{env=process.env,run,log=console.error}={}){
  if(!["check","vercel"].includes(mode)){log("Usage: node scripts/database-lifecycle.mjs <check|vercel>");return 1;}
  try{validateDatabaseTarget(env);}catch(error){log(error.message);return 1;}
  const execute=run??((tool,args)=>{
    const cli=require.resolve(tool==="prisma"?"prisma/build/index.js":"next/dist/bin/next");
    const result=spawnSync(process.execPath,[cli,...args],{env,stdio:"inherit"});
    return result.status??1;
  });
  const status=execute("prisma",["migrate","status"]);
  if(status!==0){
    log("Database is not ready for this checkout. Rehearse pending migrations on a database branch, then run npm run db:migrate:deploy against the intended database. Startup and builds never apply migrations automatically.");
    return status;
  }
  if(mode==="check")return 0;
  const generated=execute("prisma",["generate"]);
  return generated===0?execute("next",["build"]):generated;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const mode=process.argv[2];
  require("@next/env").loadEnvConfig(process.cwd(),mode==="check"&&process.env.NODE_ENV!=="production");
  process.exitCode=runDatabaseLifecycle(mode);
}
