import "server-only";
import { getSupabaseAdmin } from "./supabase-server";
import { deliverEntryEmail, relayConfig } from "./entry-email";
import { entryDeliveryId, entryEmailEnabled } from "./entry-email-message";
import { sendTelegramMessage, telegramChatIds } from "./telegram";

type TestClaim = { test_id: string; channel: "gmail" | "telegram"; queued_at: string; claim_token: string };
type TestResult = { status: "sent" | "needs_review"; receipt: Record<string, unknown> };
const testIdPattern = /^notification-test-v1-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function notificationTestText(testId: string, queuedAt: string, now = Date.now()) {
  const time = new Date(queuedAt).getTime();
  if (!testIdPattern.test(testId) || !Number.isFinite(time) || time > now + 60_000 || now - time >= 86400_000) return null;
  return [
    "TEST ONLY - Preferred Maintenance notification delivery check",
    `TEST ID: ${testId}`,
    `Requested at: ${new Date(time).toISOString()}`,
    "Synthetic notification. No employee or work submission was created.",
    "Payroll hours: 0.00. No payroll records or totals were changed.",
    "This checks notification delivery only, not submission saving."
  ].join("\n");
}

async function deliverTest(claim: TestClaim): Promise<TestResult> {
  const text = notificationTestText(claim.test_id, claim.queued_at);
  if (!text) return { status: "needs_review", receipt: { errorCode: "invalid_test" } };
  if (claim.channel === "gmail") {
    const config = relayConfig();
    if (!config) return { status: "needs_review", receipt: { errorCode: "gmail_not_configured" } };
    const result = await deliverEntryEmail({
      submission_id: claim.test_id, delivery_id: entryDeliveryId(claim.test_id),
      queued_at: claim.queued_at, message_text: text, lease_token: claim.claim_token
    }, config);
    return {
      status: result.outcome === "sent" ? "sent" : "needs_review",
      receipt: { deliveryId: entryDeliveryId(claim.test_id), ...result }
    };
  }
  if (claim.channel === "telegram") {
    const result = await sendTelegramMessage(text, [...new Set(telegramChatIds("entry"))], true);
    return {
      status: result.configured && result.results.length > 0 && result.results.every((r) => r.ok) ? "sent" : "needs_review",
      receipt: { configured: result.configured, results: result.results }
    };
  }
  return { status: "needs_review", receipt: { errorCode: "invalid_channel" } };
}

export async function processNotificationTests() {
  const empty = { processed: 0, sent: 0, needsReview: 0 };
  if (!entryEmailEnabled()) return empty;
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("Notification test configuration is incomplete");
  // The RPC durably marks each channel sending before any external request.
  // It never reclaims a sending row, including after a crash or unknown result.
  const { data, error } = await supabase.rpc("claim_notification_tests");
  if (error) throw new Error("Could not claim notification tests");
  const claims = (data ?? []) as TestClaim[];
  const results = await Promise.allSettled(claims.map(async (claim) => {
    let result: TestResult;
    try { result = await deliverTest(claim); }
    catch { result = { status: "needs_review", receipt: { errorCode: "outcome_unknown" } }; }
    const { data: saved, error: saveError } = await supabase.rpc("finish_notification_test", {
      p_test_id: claim.test_id, p_channel: claim.channel, p_claim_token: claim.claim_token,
      p_status: result.status, p_result: result.receipt
    });
    if (saveError || saved !== true) throw new Error("Could not record notification test outcome");
    return result.status;
  }));
  // A result-write failure for one channel must not abandon the other channel.
  const outcomes = results.map((result) => {
    if (result.status === "rejected") throw new Error("Could not record notification test outcome");
    return result.value;
  });
  return {
    processed: outcomes.length, sent: outcomes.filter((s) => s === "sent").length,
    needsReview: outcomes.filter((s) => s === "needs_review").length
  };
}
