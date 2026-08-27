const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
const secret = process.env.CRON_SECRET;

if (!appUrl || !secret) {
  console.error("NEXT_PUBLIC_APP_URL and CRON_SECRET are required");
  process.exit(1);
}

try {
  const response = await fetch(`${appUrl}/api/cron/data-import`, {
    headers: { Authorization: `Bearer ${secret}` },
    signal: AbortSignal.timeout(330_000),
  });
  const payload = await response.text();
  console.log(payload);
  if (!response.ok) process.exitCode = 1;
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
