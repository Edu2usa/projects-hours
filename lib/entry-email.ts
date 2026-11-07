import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { getSupabaseAdmin } from "./supabase-server";
import { ENTRY_EMAIL_RECIPIENT, ENTRY_EMAIL_SENDER, MAX_EMAIL_BYTES, entryDeliveryId, entryEmailEnabled } from "./entry-email-message";

export type EmailClaim = {
  submission_id: string;
  delivery_id: string;
  queued_at: string;
  message_text: string;
  lease_token: string;
};
export type DeliveryOutcome = { outcome: "sent" | "retry" | "needs_review"; errorCode?: string; providerId?: string };
export type RelayConfig = { url: string; secret: string };

export function relayConfig(): RelayConfig | null {
  const url = process.env.GMAIL_RELAY_URL;
  const secret = process.env.GMAIL_RELAY_SECRET;
  // No query, fragments, embedded credentials, alternate host, port, or protocol.
  if (!url || !/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(url) || !secret || secret.length < 32) return null;
  return { url, secret };
}

export function cronAuthorized(authorization: string | null) {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 32 || !authorization) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const actual = Buffer.from(authorization);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

// Reconstruct the exact same payload from the immutable database snapshot on
// every attempt. Only the signature timestamp changes. Never call Gmail directly.
export function relayPayload(claim: EmailClaim, now = Date.now()) {
  const queuedAt = new Date(claim.queued_at);
  if (!claim.submission_id || claim.delivery_id !== entryDeliveryId(claim.submission_id) ||
      typeof claim.message_text !== "string" || !claim.message_text || Buffer.byteLength(claim.message_text, "utf8") > MAX_EMAIL_BYTES ||
      !Number.isFinite(queuedAt.getTime()) || queuedAt.getTime() > now + 60_000 || now - queuedAt.getTime() >= 7 * 24 * 60 * 60 * 1000) return null;
  return JSON.stringify({
    version: 1,
    deliveryId: claim.delivery_id,
    submissionId: claim.submission_id,
    queuedAt: queuedAt.toISOString(),
    sender: ENTRY_EMAIL_SENDER,
    recipient: ENTRY_EMAIL_RECIPIENT,
    text: claim.message_text
  });
}

export async function deliverEntryEmail(claim: EmailClaim, config: RelayConfig, fetcher: typeof fetch = fetch): Promise<DeliveryOutcome> {
  const payload = relayPayload(claim);
  if (!payload) return { outcome: "needs_review", errorCode: "invalid_snapshot" };
  const timestamp = String(Date.now());
  const signature = createHmac("sha256", config.secret).update(`${timestamp}.${payload}`).digest("hex");
  try {
    const signal = AbortSignal.timeout(20_000);
    let response = await fetcher(config.url, {
      method: "POST", redirect: "manual", signal,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ payload, timestamp, signature })
    });
    // Apps Script ContentService redirects the response to Google. Read it by
    // GET only: never forward the signed request body to a redirect destination.
    if (response.status === 302 || response.status === 303) {
      const location = response.headers.get("location");
      let target: URL | null = null;
      try { target = location ? new URL(location) : null; } catch { /* invalid redirect is held below */ }
      if (!target || target.protocol !== "https:" || target.hostname !== "script.googleusercontent.com" ||
          target.port || target.username || target.password || target.pathname !== "/macros/echo") {
        return { outcome: "needs_review", errorCode: "invalid_relay_redirect" };
      }
      response = await fetcher(target.toString(), { method: "GET", redirect: "error", signal });
    }
    if (!response.ok) {
      // Authentication/deployment/payload rejection is configuration trouble,
      // not a temporary outage. Never churn the queue on permanent failures.
      const retryable = response.status === 408 || response.status === 429 || response.status >= 500;
      return { outcome: retryable ? "retry" : "needs_review", errorCode: "relay_http_error" };
    }
    const data = await readReceipt(response);
    if (!data || data.deliveryId !== claim.delivery_id) return { outcome: "needs_review", errorCode: "invalid_relay_receipt" };
    if (data.status === "sent" && typeof data.providerId === "string" && data.providerId.length > 0 && data.providerId.length <= 200) return { outcome: "sent", providerId: data.providerId };
    if (data.status === "retry" || data.status === "needs_review") {
      return { outcome: data.status, errorCode: safeErrorCode(data.errorCode) };
    }
    return { outcome: "needs_review", errorCode: "invalid_relay_receipt" };
  } catch {
    // A lost HTTP response is safe to retry through the ledger-backed relay.
    // The relay itself holds any ambiguous Gmail send as needs_review.
    return { outcome: "retry", errorCode: "relay_transport_error" };
  }
}

async function readReceipt(response: Response): Promise<Record<string, unknown> | null> {
  if (!response.body) return null;
  const reader = response.body.getReader();
  const parts: Uint8Array[] = [];
  let bytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > 16_384) { await reader.cancel(); return null; }
    parts.push(value);
  }
  try {
    const result: unknown = JSON.parse(Buffer.concat(parts).toString("utf8"));
    return result && typeof result === "object" && !Array.isArray(result) ? result as Record<string, unknown> : null;
  } catch { return null; }
}

function safeErrorCode(value: unknown) {
  return typeof value === "string" && /^[a-zA-Z0-9_:-]{1,80}$/.test(value) ? value : "relay_error";
}

export async function processEntryEmails() {
  if (!entryEmailEnabled()) return { enabled: false, processed: 0, sent: 0, retry: 0, needsReview: 0 };
  const config = relayConfig();
  const supabase = getSupabaseAdmin();
  if (!config || !supabase) throw new Error("Entry email configuration is incomplete");
  const { data, error } = await supabase.rpc("claim_entry_emails", { p_limit: 5 });
  if (error) throw new Error("Could not claim entry emails");
  const claims = (data ?? []) as EmailClaim[];
  const outcomes = await Promise.all(claims.map(async (claim) => {
    const result = await deliverEntryEmail(claim, config);
    const { data: saved, error: saveError } = await supabase.rpc("finish_entry_email", {
      p_submission_id: claim.submission_id, p_lease_token: claim.lease_token,
      p_outcome: result.outcome, p_error_code: result.errorCode ?? null
    });
    if (saveError || saved !== true) throw new Error("Could not record entry email outcome");
    return result.outcome;
  }));
  return {
    enabled: true, processed: outcomes.length,
    sent: outcomes.filter((outcome) => outcome === "sent").length,
    retry: outcomes.filter((outcome) => outcome === "retry").length,
    needsReview: outcomes.filter((outcome) => outcome === "needs_review").length
  };
}
