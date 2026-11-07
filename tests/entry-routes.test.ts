import assert from "node:assert/strict";
import { test } from "node:test";
import { NextRequest } from "next/server";
import { createSessionToken } from "../lib/auth-token";
import { entryDeliveryId } from "../lib/entry-email-message";
import { GET as emailCron } from "../app/api/cron/entry-emails/route";
import { POST as submitEntry } from "../app/api/entries/route";
import { entry, state } from "./fixtures";

const originalFetch = global.fetch;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const token = createSessionToken({ employeeId: "worker-1", role: "worker", language: "en", admin: false });
function request(body = entry, authorized = true) {
  return new NextRequest("https://app.test.invalid/api/entries", { method: "POST", headers: {
    "content-type": "application/json", ...(authorized ? { authorization: `Bearer ${token}` } : {})
  }, body: JSON.stringify(body) });
}
function cron(authorization?: string, query = "") {
  return new NextRequest(`https://app.test.invalid/api/cron/entry-emails${query}`, { headers: authorization ? { authorization } : {} });
}

test("entry authorization and ownership fail before persistence or notification", async () => {
  assert.equal((await submitEntry(request(entry, false))).status, 401);
  assert.equal((await submitEntry(request({ ...entry, submittedByEmployeeId: "other" }))).status, 400);
  assert.equal((await submitEntry(request({ ...entry, workerLines: [{ ...entry.workerLines[0], employeeId: "other" }] }))).status, 400);
});

test("new entry commits once, queues minimal email, keeps Telegram, and exposes no outbox", async () => {
  process.env.ENTRY_EMAIL_ENABLED = "true";
  let writes = 0; let telegram = 0; let loads = 0;
  global.fetch = async (url, init) => {
    const target = String(url);
    if (target.includes("/rest/v1/settings?")) { loads++; return json({ value_json: state, updated_at: "2026-11-07T00:00:00Z" }); }
    if (target.endsWith("/rpc/save_hours_entry_with_email")) {
      const body = JSON.parse(String(init?.body)); writes++;
      assert.equal(body.p_email_enabled, true);
      assert.equal(body.p_delivery_id, entryDeliveryId(entry.id));
      assert.ok(body.p_message_text.includes("Test Worker"));
      assert.ok(!body.p_message_text.includes("Must Not Appear"));
      return json(writes === 1 ? { configured: true, conflict: true } : { configured: true, revision: "new" });
    }
    if (target.startsWith("https://api.telegram.org/")) {
      telegram++; assert.ok(JSON.parse(String(init?.body)).text.includes(`Submission ID: ${entry.id}`));
      return json({ ok: true });
    }
    assert.fail(`Unexpected mocked destination: ${new URL(target).hostname}`);
  };
  try {
    const result = await submitEntry(request());
    assert.equal(result.status, 200);
    const body = await result.json();
    assert.equal(body.ok, true); assert.equal(body.state.entries.length, 1);
    assert.deepEqual(Object.keys(body).sort(), ["configured", "ok", "revision", "state"]);
    assert.equal(writes, 2); assert.equal(loads, 2); assert.equal(telegram, 1);
  } finally { global.fetch = originalFetch; delete process.env.ENTRY_EMAIL_ENABLED; }
});

test("duplicate persisted ID and same-data duplicate never save or notify", async () => {
  try {
    for (const stored of [{ ...entry, notes: "Different", workDate: "2026-11-06" }, { ...entry, id: "another-id" }]) {
      global.fetch = async (url) => {
        assert.ok(String(url).includes("/rest/v1/settings?"));
        return json({ value_json: { ...state, entries: [stored] }, updated_at: "rev" });
      };
      assert.equal((await submitEntry(request())).status, 409);
    }
  } finally { global.fetch = originalFetch; }
});

test("disabled email still saves and notifies Telegram; failure there cannot reject saved hours", async () => {
  delete process.env.ENTRY_EMAIL_ENABLED;
  global.fetch = async (url, init) => {
    if (String(url).includes("/rest/v1/settings?")) return json({ value_json: state, updated_at: "rev" });
    if (String(url).endsWith("/rpc/save_hours_entry_with_email")) {
      const body = JSON.parse(String(init?.body));
      assert.equal(body.p_email_enabled, false); assert.equal(body.p_message_text, null);
      return json({ configured: true });
    }
    if (String(url).startsWith("https://api.telegram.org/")) throw new Error("mock Telegram failure");
    assert.fail("Unexpected destination");
  };
  try { assert.equal((await (await submitEntry(request())).json()).ok, true); }
  finally { global.fetch = originalFetch; }
});

test("save failure has no Telegram and returns no provider/database secrets", async () => {
  global.fetch = async (url) => {
    if (String(url).includes("/rest/v1/settings?")) return json({ value_json: state, updated_at: "rev" });
    assert.ok(String(url).endsWith("/rpc/save_hours_entry_with_email"));
    return json({ message: "PRIVATE_DATABASE_ERROR", code: "PGRST202" }, 404);
  };
  try {
    const result = await submitEntry(request()); assert.equal(result.status, 500);
    assert.ok(!(await result.text()).includes("PRIVATE_DATABASE_ERROR"));
  } finally { global.fetch = originalFetch; }
});

test("cron rejects missing/wrong/query auth and is inert with flag off", async () => {
  assert.equal((await emailCron(cron())).status, 401);
  assert.equal((await emailCron(cron("Bearer wrong"))).status, 401);
  assert.equal((await emailCron(cron(undefined, `?secret=${process.env.CRON_SECRET}`))).status, 401);
  assert.equal((await (await emailCron(cron(`Bearer ${process.env.CRON_SECRET}`))).json()).enabled, false);
});

test("cron persists sent, retry and Gmail uncertainty independently and returns counts only", async () => {
  process.env.ENTRY_EMAIL_ENABLED = "true";
  const claims = ["sent", "retry", "needs_review"].map((status, i) => ({
    submission_id: `dispatch-${i}`, delivery_id: entryDeliveryId(`dispatch-${i}`), queued_at: new Date().toISOString(),
    message_text: "PRIVATE_TEST_PAYLOAD", lease_token: `lease-${i}`, expected: status
  }));
  const completed: string[] = [];
  global.fetch = async (url, init) => {
    const target = String(url); const body = JSON.parse(String(init?.body));
    if (target.endsWith("/rpc/claim_notification_tests")) return json([]);
    if (target.endsWith("/rpc/claim_entry_emails")) return json(claims);
    if (target.startsWith("https://script.google.com/")) {
      const payload = JSON.parse(body.payload);
      const row = claims.find((c) => c.delivery_id === payload.deliveryId)!;
      return json({ deliveryId: row.delivery_id, status: row.expected, providerId: "test-receipt", errorCode: "test_error" });
    }
    assert.ok(target.endsWith("/rpc/finish_entry_email"));
    completed.push(body.p_outcome); return json(true);
  };
  try {
    const result = await emailCron(cron(`Bearer ${process.env.CRON_SECRET}`));
    assert.equal(result.status, 200);
    assert.deepEqual(await result.json(), { ok: true, enabled: true, processed: 3, sent: 1, retry: 1, needsReview: 1, notificationTests: { processed: 0, sent: 0, needsReview: 0 } });
    assert.deepEqual(completed.sort(), ["needs_review", "retry", "sent"]);
  } finally { global.fetch = originalFetch; delete process.env.ENTRY_EMAIL_ENABLED; }
});

test("cron receipt-write failure is generic and leaves durable lease recoverable", async () => {
  process.env.ENTRY_EMAIL_ENABLED = "true";
  const id = "receipt-failure";
  global.fetch = async (url) => {
    const target = String(url);
    if (target.endsWith("/rpc/claim_entry_emails")) return json([{ submission_id: id, delivery_id: entryDeliveryId(id), queued_at: new Date().toISOString(), message_text: "test", lease_token: "lease" }]);
    if (target.startsWith("https://script.google.com/")) return json({ deliveryId: entryDeliveryId(id), status: "sent", providerId: "receipt" });
    return json({ message: "PRIVATE_DATABASE_ERROR" }, 500);
  };
  try {
    const result = await emailCron(cron(`Bearer ${process.env.CRON_SECRET}`)); assert.equal(result.status, 503);
    assert.deepEqual(await result.json(), { ok: false, error: "Entry email delivery is unavailable." });
  } finally { global.fetch = originalFetch; delete process.env.ENTRY_EMAIL_ENABLED; }
});
