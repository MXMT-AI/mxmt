/** Deployment flags only affect menu visibility; they are not authorization controls. */
export function navigationFeatures(
  env: Record<string, string | undefined> = process.env,
) {
  return {
    merchandising: env.MVP_NAVIGATION_ENABLED !== "false",
    legacy: env.LEGACY_NAVIGATION_ENABLED !== "false",
  };
}
