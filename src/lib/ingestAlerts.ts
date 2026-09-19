import "server-only";

const MAX_ERROR_LENGTH = 500;

export type IngestAlertPayload = {
  event: "yatstats_ingest_failed" | "yatstats_ingest_recovered" | "yatstats_ingest_stale";
  job: string;
  occurredAt: string;
  environment: string;
  consecutiveFailures?: number | null;
  lastSuccessAt?: string | null;
  error?: string | null;
  details?: Record<string, unknown>;
};

function sanitizeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error || "Unknown ingest failure");
  // Never forward a PostgreSQL URL or password to an operations webhook.
  return message
    .replace(/postgres(?:ql)?:\/\/[^\s]+/gi, "[redacted database url]")
    .replace(/password\s*=\s*[^\s,;]+/gi, "password=[redacted]")
    .slice(0, MAX_ERROR_LENGTH);
}

export function getIngestAlertWebhookUrl(): string | null {
  const value = process.env.INGEST_ALERT_WEBHOOK_URL?.trim();
  return value || null;
}

export async function sendIngestAlert(payload: Omit<IngestAlertPayload, "environment">): Promise<void> {
  const webhookUrl = getIngestAlertWebhookUrl();
  if (!webhookUrl) {
    console.error("[ingest-alert] INGEST_ALERT_WEBHOOK_URL is not configured", payload);
    return;
  }

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      ...payload,
      environment: process.env.VERCEL_ENV || process.env.NODE_ENV || "unknown",
      error: payload.error ? sanitizeError(payload.error) : null,
    }),
  });

  if (!response.ok) {
    const text = (await response.text()).slice(0, MAX_ERROR_LENGTH);
    throw new Error(`Ingest alert webhook failed: ${response.status} ${text}`);
  }
}

export { sanitizeError };
