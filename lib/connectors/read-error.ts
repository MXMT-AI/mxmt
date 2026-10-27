import type { CheckCode } from "./contract";
export class ConnectorReadError extends Error {
  constructor(
    readonly code: Exclude<CheckCode, "OK">,
    readonly retryAt?: Date,
  ) {
    super(code);
    this.name = "ConnectorReadError";
  }
}
