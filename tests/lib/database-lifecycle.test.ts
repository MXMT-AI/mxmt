import {expect,it,vi} from "vitest";
import {runDatabaseLifecycle,validateDatabaseTarget} from "../../scripts/database-lifecycle.mjs";
const env={DATABASE_URL:"postgresql://user:synthetic@ep-app-pooler.eu-central-1.aws.neon.tech/app?sslmode=require",DIRECT_URL:"postgresql://user:synthetic@ep-app.eu-central-1.aws.neon.tech/app?sslmode=require"};
it("stops local startup on pending/failed migrations without writing or building",()=>{
 const run=vi.fn<(tool:string,args:string[])=>number>(()=>1),log=vi.fn();expect(runDatabaseLifecycle("check",{env,run,log})).toBe(1);expect(run.mock.calls).toEqual([["prisma",["migrate","status"]]]);expect(log).toHaveBeenCalledWith(expect.stringContaining("db:migrate:deploy"));
});
it.each(["production","preview","development",undefined])("checks %s deployments without automatically applying migrations",VERCEL_ENV=>{
 const run=vi.fn<(tool:string,args:string[])=>number>(()=>0);expect(runDatabaseLifecycle("vercel",{env:{...env,VERCEL_ENV},run})).toBe(0);
 expect(run.mock.calls).toEqual([["prisma",["migrate","status"]],["prisma",["generate"]],["next",["build"]]]);
 expect(run.mock.calls.some(call=>call[1].includes("deploy"))).toBe(false);
});
it("does not build an application when migration readiness or generation fails",()=>{
 const run=vi.fn<(tool:string,args:string[])=>number>(()=>2),log=vi.fn();expect(runDatabaseLifecycle("vercel",{env,run,log})).toBe(2);expect(run).toHaveBeenCalledTimes(1);
 run.mockReset().mockReturnValueOnce(0).mockReturnValueOnce(3);expect(runDatabaseLifecycle("vercel",{env,run,log})).toBe(3);expect(run).toHaveBeenCalledTimes(2);
});
it.each([
 {DIRECT_URL:"postgresql://user:synthetic@ep-other.eu-central-1.aws.neon.tech/app"},
 {DIRECT_URL:env.DIRECT_URL.replace("/app","/another")},
 {DIRECT_URL:env.DIRECT_URL+"&schema=another"},
 {DIRECT_URL:env.DATABASE_URL},
 {DIRECT_URL:"invalid-sensitive-string"},
 {DATABASE_URL:undefined},
])("rejects missing or mismatched runtime/migration targets without exposing credentials: %#",patch=>{
 const run=vi.fn<(tool:string,args:string[])=>number>(()=>0),log=vi.fn();expect(runDatabaseLifecycle("vercel",{env:{...env,...patch},run,log})).toBe(1);expect(run).not.toHaveBeenCalled();expect(JSON.stringify(log.mock.calls)).not.toMatch(/synthetic|invalid-sensitive-string/);
});
it("allows local PostgreSQL and equivalent pooled/direct Neon targets",()=>{
 expect(()=>validateDatabaseTarget(env)).not.toThrow();expect(()=>validateDatabaseTarget({DATABASE_URL:"postgresql://a:b@localhost:5432/app",DIRECT_URL:"postgresql://a:b@localhost:5432/app"})).not.toThrow();
});

it.each([
 {DATABASE_URL:"postgresql://a:b@db-pooler.example.com/app",DIRECT_URL:"postgresql://a:b@db.example.com/app"},
 {DATABASE_URL:"postgresql://a:b@ep-app-pooler.neon.tech.example.com/app",DIRECT_URL:"postgresql://a:b@ep-app.neon.tech.example.com/app"},
 {DATABASE_URL:"postgresql://a:b@localhost/app?host=/run/postgres-a",DIRECT_URL:"postgresql://a:b@localhost/app?host=/run/postgres-b"},
 {DATABASE_URL:"postgresql://a:b@localhost/app?host=/run/postgres-a",DIRECT_URL:"postgresql://a:b@localhost/app"},
 {DATABASE_URL:"postgresql://a:b@localhost/app",DIRECT_URL:"postgresql://a:b@localhost/app?host=/run/postgres-a"},
 {DATABASE_URL:"postgresql://a:b@localhost/app?host=/run/a&host=/run/b",DIRECT_URL:"postgresql://a:b@localhost/app?host=/run/a&host=/run/b"},
])("stops before migration status for mismatched or ambiguous effective hosts: %#",targets=>{
 const run=vi.fn<(tool:string,args:string[])=>number>(()=>0),log=vi.fn();
 expect(runDatabaseLifecycle("check",{env:targets,run,log})).toBe(1);
 expect(run).not.toHaveBeenCalled();
 expect(log).toHaveBeenCalledWith("DATABASE_URL and DIRECT_URL must target the same database and schema.");
});
it("accepts identical non-Neon hosts and matching decoded Unix-socket targets",()=>{
 expect(()=>validateDatabaseTarget({DATABASE_URL:"postgresql://a:b@db-pooler.example.com/app",DIRECT_URL:"postgresql://a:b@db-pooler.example.com/app"})).not.toThrow();
 expect(()=>validateDatabaseTarget({DATABASE_URL:"postgresql://a:b@localhost/app?host=%2Fvar%2Frun%2Fpostgresql",DIRECT_URL:"postgresql://a:b@localhost:5432/app?host=/var/run/postgresql"})).not.toThrow();
});

it("rejects matching custom schema on a transaction pooler before checking migration history", () => {
 const run=vi.fn<(tool:string,args:string[])=>number>(()=>0),log=vi.fn();
 const targets={DATABASE_URL:env.DATABASE_URL+"&schema=custom",DIRECT_URL:env.DIRECT_URL+"&schema=custom"};
 expect(runDatabaseLifecycle("vercel",{env:targets,run,log})).toBe(1);
 expect(run).not.toHaveBeenCalled();
 expect(log).toHaveBeenCalledWith("Custom schemas require a direct DATABASE_URL; transaction-pooled runtime URLs are unsupported.");
});
it("allows matching custom schema with explicit direct runtime and migration endpoints", () => {
 const direct=env.DIRECT_URL+"&schema=custom";
 expect(()=>validateDatabaseTarget({DATABASE_URL:direct,DIRECT_URL:direct})).not.toThrow();
});
