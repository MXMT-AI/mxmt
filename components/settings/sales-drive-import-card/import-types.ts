export interface Progress {
  id: string;
  state: string;
  mode: string;
  stats: Record<string, number>;
  issues: string[];
  errorCode: string | null;
  availableAt: string;
  updatedAt: string;
}
export interface ImportResponse extends Record<string, unknown> {
  job?: Progress | null;
  coverage?: {
    firstObservedAt: string | null;
    observedDays: number;
    missingDays?: number;
  };
  resources?: Array<{
    resource: string;
    lastSuccess: string | null;
    lagSeconds: number | null;
    pending: number;
    errorCode: string | null;
  }>;
  calculation?: { state: string } | null;
  backfill?: {
    id: string;
    state: string;
    stats: { pages?: number; orders?: number };
  } | null;
  lastTickAt?: string | null;
  code?: string;
  error?: string;
}
