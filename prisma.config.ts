import { defineConfig } from "prisma/config";
import nextEnv from "@next/env";

// Match application .env precedence; CLI operations use the direct endpoint.
nextEnv.loadEnvConfig(process.cwd(), process.env.NODE_ENV !== "production");

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: { url: process.env.DIRECT_URL },
});
