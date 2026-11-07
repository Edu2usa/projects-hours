import assert from "node:assert/strict";
import { test } from "node:test";
import { NextRequest } from "next/server";
import { GET as cron } from "../app/api/cron/entry-emails/route";
import { entryDeliveryId } from "../lib/entry-email-message";
import { notificationTestText, processNotificationTests } from "../lib/notification-test";

const originalFetch = global.fetch;
const testId = "notification-test-v1-00000000-0000-4000-8000-000000000001";
const queuedAt = () => new Date().toISOString();
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
function claims(channels = ["gmail", "telegram"]) {
  return channels.map((channel) => ({ test_id: testId, channel, queued_at: queuedAt(), claim_token: "synthetic-claim" }));
}

test("fixed synthetic text has TEST ID and zero hours; invalid/expired identities fail closed", () => {
  const text = notificationTestText(testId, queuedAt())!;
  for (const required of ["TEST ONLY", testId, "0.00", "No employee", "not submission saving"]) assert.ok(text.includes(required));
  for (const id of ["", "real-entry", `${testId}\nmalicious`]) assert.equal(notificationTestText(id, queuedAt()), null);
  for (const time of ["invalid", new Date(Date.now() - 86400_000).toISOString(), new Date(Date.now() + 120_000).toISOString()]) assert.equal(notificationTestText(testId, time), null);
});

test("no deliberate queue or disabled flag means no notification, even with valid cron auth", async () => {
  try {
    delete process.env.ENTRY_EMAIL_ENABLED;
    assert.deepEqual(await processNotificationTests(), { processed: 0, sent: 0, needsReview: 0 });
    process.env.ENTRY_EMAIL_ENABLED = "true";
    global.fetch = async (url) => {
      assert.ok(String(url).endsWith("/rpc/claim_notification_tests") || String(url).endsWith("/rpc/claim_entry_emails"));
      return json([]);
    };
    const response = await cron(new NextRequest("https://app.test.invalid/api/cron/entry-emails", { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } }));
    assert.equal(response.status, 200);
    assert.deepEqual((await response.json()).notificationTests, { processed: 0, sent: 0, needsReview: 0 });
  } finally { global.fetch = originalFetch; delete process.env.ENTRY_EMAIL_ENABLED; }
});

test("uses existing relay and Telegram destinations once, records provider IDs privately, never writes payroll", async () => {
  process.env.ENTRY_EMAIL_ENABLED = "true";
  const oldChats = process.env.TELEGRAM_ENTRY_CHAT_IDS;
  process.env.TELEGRAM_ENTRY_CHAT_IDS = "test-chat, test-chat, second-chat";
  let claimed = false, gmail = 0, telegram = 0;
  const results: Record<string, any> = {};
  global.fetch = async (url, init) => {
    const target = String(url); const body = JSON.parse(String(init?.body));
    if (target.endsWith("/rpc/claim_notification_tests")) { const rows = claimed ? [] : claims(); claimed = true; return json(rows); }
    if (target.endsWith("/rpc/claim_entry_emails")) return json([]);
    assert.ok(claimed, "No send may precede durable claim");
    if (target.startsWith("https://script.google.com/")) {
      gmail++; const payload = JSON.parse(body.payload);
      assert.equal(payload.sender, "edu2usa@gmail.com"); assert.equal(payload.recipient, "e.oliveira@prefmaint.com");
      assert.equal(payload.submissionId, testId); assert.equal(payload.deliveryId, entryDeliveryId(testId));
      assert.ok(payload.text.startsWith("TEST ONLY"));
      return json({ deliveryId: payload.deliveryId, status: "sent", providerId: "gmail-message-123" });
    }
    if (target.startsWith("https://api.telegram.org/")) {
      telegram++; assert.ok(["test-chat", "second-chat"].includes(body.chat_id));
      assert.ok(body.text.includes(testId)); assert.equal(init?.redirect, "error"); assert.ok(init?.signal);
      return json({ ok: true, result: { message_id: telegram, text: "DO_NOT_STORE", chat: { username: "DO_NOT_STORE" } } });
    }
    assert.ok(target.endsWith("/rpc/finish_notification_test"), "No payroll, receipt, or normal outbox writes allowed");
    results[body.p_channel] = body; return json(true);
  };
  try {
    const response = await cron(new NextRequest("https://app.test.invalid/api/cron/entry-emails", { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } }));
    const body = await response.json(); assert.equal(response.status, 200);
    assert.deepEqual(body.notificationTests, { processed: 2, sent: 2, needsReview: 0 });
    assert.ok(!JSON.stringify(body).includes(testId)); assert.ok(!JSON.stringify(body).includes("gmail-message"));
    assert.equal(results.gmail.p_result.providerId, "gmail-message-123");
    assert.deepEqual(results.telegram.p_result.results.map((r: any) => r.messageId), [1,2]);
    assert.ok(!JSON.stringify(results).includes("DO_NOT_STORE"));
    await processNotificationTests();
    assert.equal(gmail, 1); assert.equal(telegram, 2);
  } finally { global.fetch = originalFetch; delete process.env.ENTRY_EMAIL_ENABLED; process.env.TELEGRAM_ENTRY_CHAT_IDS = oldChats; }
});

test("channel failures are independent and all ambiguous or retryable test outcomes are held", async () => {
  process.env.ENTRY_EMAIL_ENABLED = "true";
  try {
    for (const failure of ["transport", "http", "bad_receipt", "retry"]) {
      const results: Record<string, any> = {};
      let sends = 0;
      global.fetch = async (url, init) => {
        const target = String(url); const body = JSON.parse(String(init?.body));
        if (target.endsWith("/rpc/claim_notification_tests")) return json(claims());
        if (target.endsWith("/rpc/finish_notification_test")) { results[body.p_channel] = body; return json(true); }
        sends++;
        if (failure === "transport") throw new Error("PRIVATE_CREDENTIAL_MUST_NOT_ESCAPE");
        if (failure === "http") return json({}, 503);
        if (target.startsWith("https://script.google.com/")) {
          const payload = JSON.parse(body.payload);
          return json({ deliveryId: payload.deliveryId, status: failure === "retry" ? "retry" : "sent", errorCode: "pre_send_busy" });
        }
        return json({ ok: failure === "retry", result: { message_id: 22 } });
      };
      const outcome = await processNotificationTests();
      assert.equal(outcome.processed, 2); assert.equal(sends, 2);
      assert.equal(results.gmail.p_status, "needs_review");
      assert.equal(results.telegram.p_status, failure === "retry" ? "sent" : "needs_review");
      assert.ok(!JSON.stringify(results).includes("PRIVATE_CREDENTIAL"));
    }
  } finally { global.fetch = originalFetch; delete process.env.ENTRY_EMAIL_ENABLED; }
});

test("claim failure never sends; result-write failure is generic and cannot reclaim an attempt", async () => {
  process.env.ENTRY_EMAIL_ENABLED = "true";
  try {
    global.fetch = async (url) => { assert.ok(String(url).endsWith("/rpc/claim_notification_tests")); return json({ message: "PRIVATE_DATABASE_ERROR" }, 500); };
    await assert.rejects(processNotificationTests(), /Could not claim notification tests/);
    let claimed = false, sends = 0;
    global.fetch = async (url) => {
      const target = String(url);
      if (target.endsWith("/rpc/claim_notification_tests")) { const rows = claimed ? [] : claims(["telegram"]); claimed = true; return json(rows); }
      if (target.startsWith("https://api.telegram.org/")) { sends++; return json({ ok: true, result: { message_id: 33 } }); }
      assert.ok(target.endsWith("/rpc/finish_notification_test")); return json({ message: "PRIVATE_DATABASE_ERROR" }, 500);
    };
    await assert.rejects(processNotificationTests(), /Could not record notification test outcome/);
    assert.deepEqual(await processNotificationTests(), { processed: 0, sent: 0, needsReview: 0 });
    assert.equal(sends, 1);
  } finally { global.fetch = originalFetch; delete process.env.ENTRY_EMAIL_ENABLED; }
});

test("missing channel configuration is held without provider requests", async () => {
  process.env.ENTRY_EMAIL_ENABLED = "true";
  const oldRelay = process.env.GMAIL_RELAY_URL, oldBot = process.env.TELEGRAM_BOT_TOKEN;
  delete process.env.GMAIL_RELAY_URL; delete process.env.TELEGRAM_BOT_TOKEN;
  const statuses: string[] = [];
  global.fetch = async (url, init) => {
    const target = String(url);
    if (target.endsWith("/rpc/claim_notification_tests")) return json(claims());
    assert.ok(target.endsWith("/rpc/finish_notification_test"), "No provider call with missing config");
    statuses.push(JSON.parse(String(init?.body)).p_status); return json(true);
  };
  try {
    assert.deepEqual(await processNotificationTests(), { processed: 2, sent: 0, needsReview: 2 });
    assert.deepEqual(statuses, ["needs_review", "needs_review"]);
  } finally {
    global.fetch = originalFetch; delete process.env.ENTRY_EMAIL_ENABLED;
    process.env.GMAIL_RELAY_URL = oldRelay; process.env.TELEGRAM_BOT_TOKEN = oldBot;
  }
});

test("test-ledger failure cannot end or fail a successful pending normal email run", async () => {
  process.env.ENTRY_EMAIL_ENABLED = "true";
  let releaseFinish!: () => void;
  const finishGate = new Promise<void>((resolve) => { releaseFinish = resolve; });
  let normalFinishStarted = false, normalFinishSaved = false, responded = false;
  const realId = "normal-email-during-test-error";
  global.fetch = async (url) => {
    const target = String(url);
    if (target.endsWith("/rpc/claim_notification_tests")) return json({ message: "PRIVATE_TEST_DATABASE_ERROR" }, 500);
    if (target.endsWith("/rpc/claim_entry_emails")) return json([{
      submission_id: realId, delivery_id: entryDeliveryId(realId), queued_at: queuedAt(),
      message_text: "Mock existing normal queue", lease_token: "normal-lease"
    }]);
    if (target.startsWith("https://script.google.com/")) return json({ deliveryId: entryDeliveryId(realId), status: "sent", providerId: "normal-message" });
    assert.ok(target.endsWith("/rpc/finish_entry_email"));
    normalFinishStarted = true; await finishGate; normalFinishSaved = true; return json(true);
  };
  try {
    const pending = cron(new NextRequest("https://app.test.invalid/api/cron/entry-emails", { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } })).then((response) => { responded = true; return response; });
    for (let i=0; i<50 && !normalFinishStarted; i++) await new Promise((resolve) => setImmediate(resolve));
    assert.equal(normalFinishStarted, true);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(responded, false, "Cron must await normal queue completion after a test-only error");
    releaseFinish();
    const response = await pending, body = await response.json();
    assert.equal(normalFinishSaved, true); assert.equal(response.status, 200);
    assert.equal(body.sent, 1); assert.equal(body.ok, true);
    assert.deepEqual(body.notificationTests, { unavailable: true });
    assert.ok(!JSON.stringify(body).includes("PRIVATE_TEST_DATABASE_ERROR"));
  } finally { releaseFinish(); global.fetch = originalFetch; delete process.env.ENTRY_EMAIL_ENABLED; }
});

test("one channel receipt-write failure waits for the other test channel to finish", async () => {
  process.env.ENTRY_EMAIL_ENABLED = "true";
  let releaseTelegram!: () => void;
  const gate = new Promise<void>((resolve) => { releaseTelegram = resolve; });
  let telegramStarted = false, telegramSaved = false, finished = false;
  global.fetch = async (url, init) => {
    const target = String(url);
    if (target.endsWith("/rpc/claim_notification_tests")) return json(claims());
    if (target.startsWith("https://script.google.com/")) return json({ deliveryId: entryDeliveryId(testId), status: "sent", providerId: "gmail-ok" });
    if (target.startsWith("https://api.telegram.org/")) { telegramStarted = true; await gate; return json({ ok: true, result: { message_id: 44 } }); }
    assert.ok(target.endsWith("/rpc/finish_notification_test"));
    if (JSON.parse(String(init?.body)).p_channel === "gmail") return json({ message: "PRIVATE_DATABASE_ERROR" }, 500);
    telegramSaved = true; return json(true);
  };
  try {
    const pending = processNotificationTests().then(() => { assert.fail("Expected result-write failure"); }, (error) => { finished = true; return error; });
    for (let i=0; i<50 && !telegramStarted; i++) await new Promise((resolve) => setImmediate(resolve));
    assert.equal(telegramStarted, true); await new Promise((resolve) => setImmediate(resolve));
    assert.equal(finished, false);
    releaseTelegram();
    assert.match((await pending).message, /Could not record notification test outcome/);
    assert.equal(telegramSaved, true);
  } finally { releaseTelegram(); global.fetch = originalFetch; delete process.env.ENTRY_EMAIL_ENABLED; }
});
