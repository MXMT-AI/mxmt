import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");
const nextConfig: NextConfig = {
  serverExternalPackages: ["@electric-sql/pglite"],
  outputFileTracingIncludes: {
    "/api/merchandising/{*,repricing/preview,reordering/preview}": [
      "./node_modules/@electric-sql/pglite/dist/{*.wasm,pglite.data}",
    ],
    "/api/{connectors/sync,cron/salesdrive-sync}": [
      "./node_modules/@electric-sql/pglite/dist/{*.wasm,pglite.data}",
    ],
  },
  experimental: { globalNotFound: true },
};

export default withNextIntl(nextConfig);
