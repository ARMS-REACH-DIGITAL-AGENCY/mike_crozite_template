import type { Pool } from "pg";

/** Shared production dependencies. Only trusted callers can supply a replay clock. */
export type MlbIngestionDb = Pick<Pool, "query">;
export type MlbIngestionOptions = {
  request?: typeof fetch;
  effectiveAt?: string;
};

export function mlbIngestionContext(options: MlbIngestionOptions = {}) {
  let effectiveAt: string | null = null;
  if (options.effectiveAt !== undefined) {
    const timestamp = Date.parse(options.effectiveAt);
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(options.effectiveAt)
        || !Number.isFinite(timestamp)) {
      throw new Error("MLB ingestion effectiveAt must be an ISO timestamp with an explicit timezone");
    }
    effectiveAt = new Date(timestamp).toISOString();
  }
  return {
    request: options.request ?? fetch,
    effectiveAt,
    now: () => effectiveAt === null ? new Date() : new Date(effectiveAt),
  };
}
