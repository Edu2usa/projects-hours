import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { test } from "node:test";
import { cronAuthorized, deliverEntryEmail, processEntryEmails, relayConfig, relayPayload, type EmailClaim } from "../lib/entry-email";
import { entryDeliveryId, entryEmailEnabled, formatEntryEmail } from "../lib/entry-email-message";
import { entry, state } from "./fixtures";

const config = { url: "https://script.google.com/macros/s/test/exec", secret: "test-secret" };
const claim = (): EmailClaim => ({ submission_id: entry.id, delivery_id: entryDeliveryId(entry.id),
  queued_at: new Date().toISOString(), message_text: formatEntryEmail(state, entry), lease_token: "test-lease" });
const response = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });

test("minimal snapshot includes this crew's details and no unrelated or passthrough data", () => {
  const text = formatEntryEmail({ ...state, employees: state.employees.map((e) => ({ ...e, pin: "PIN_SECRET" })) }, { ...entry, password: "ENTRY_SECRET" } as typeof entry);
  for (const expected of [entry.id, "Test Worker", "Test Site", "09:00", "17:00", "8.00 hrs", "Finished lobby", "Cleaning"]) assert.ok(text.includes(expected));
  for (const excluded of ["Must Not Appear", "PIN_SECRET", "ENTRY_SECRET", "42.123", "-71.456"]) assert.ok(!text.includes(excluded));
});

test("flag is exact; relay URL and cron authentication fail closed", () => {
  for (const flag of [undefined, "false", "TRUE", "1", " true "]) {
    if (flag === undefined) delete process.env.ENTRY_EMAIL_ENABLED; else process.env.ENTRY_EMAIL_ENABLED = flag;
    assert.equal(entryEmailEnabled(), false);
  }
  process.env.ENTRY_EMAIL_ENABLED = "true";
  assert.equal(entryEmailEnabled(), true);
  delete process.env.ENTRY_EMAIL_ENABLED;
  const original = process.env.GMAIL_RELAY_URL;
  for (const url of ["http://script.google.com/macros/s/test/exec", "https://script.google.com.evil.test/macros/s/test/exec", `${original}?x=1`, `${original}#fragment`, "https://user@script.google.com/macros/s/test/exec", "https://script.google.com:443/macros/s/test/exec"]) {
    process.env.GMAIL_RELAY_URL = url; assert.equal(relayConfig(), null);
  }
  process.env.GMAIL_RELAY_URL = original;
  assert.ok(relayConfig());
  assert.equal(cronAuthorized(`Bearer ${process.env.CRON_SECRET}`), true);
  assert.equal(cronAuthorized(null), false);
  assert.equal(cronAuthorized("Bearer wrong"), false);
  const secret = process.env.CRON_SECRET;
  delete process.env.CRON_SECRET;
  assert.equal(cronAuthorized(`Bearer ${secret}`), false);
  process.env.CRON_SECRET = secret;
});

test("signed relay requests have fixed identities and stable payload across retries", async () => {
  const row = claim();
  const sent: Array<{payload: string; timestamp: string; signature: string}> = [];
  const fetcher: typeof fetch = async (_url, init) => {
    const body = JSON.parse(String(init?.body)); sent.push(body);
    assert.equal(body.signature, createHmac("sha256", config.secret).update(`${body.timestamp}.${body.payload}`).digest("hex"));
    assert.match(body.timestamp, /^\d{13}$/);
    const payload = JSON.parse(body.payload);
    assert.equal(payload.sender, "edu2usa@gmail.com");
    assert.equal(payload.recipient, "e.oliveira@prefmaint.com");
    assert.equal(payload.deliveryId, row.delivery_id);
    return response({ deliveryId: row.delivery_id, status: "sent", providerId: "receipt" });
  };
  assert.equal((await deliverEntryEmail(row, config, fetcher)).outcome, "sent");
  assert.equal((await deliverEntryEmail(row, config, fetcher)).outcome, "sent");
  assert.equal(sent[0].payload, sent[1].payload);
});

test("Apps Script redirect reads only Google's response with GET and no signed body", async () => {
  const row = claim(); let calls = 0;
  const fetcher: typeof fetch = async (url, init) => {
    if (++calls === 1) return new Response(null, { status: 302, headers: { location: "https://script.googleusercontent.com/macros/echo?user_content_key=test" } });
    assert.equal(init?.method, "GET"); assert.equal(init?.body, undefined);
    assert.ok(String(url).startsWith("https://script.googleusercontent.com/"));
    return response({ deliveryId: row.delivery_id, status: "sent", providerId: "receipt" });
  };
  assert.equal((await deliverEntryEmail(row, config, fetcher)).outcome, "sent");
  assert.equal(calls, 2);
  assert.equal((await deliverEntryEmail(row, config, async () => new Response(null, { status: 302, headers: { location: "https://evil.test/" } }))).outcome, "needs_review");
});

test("transport and explicit pre-send retry use relay dedup; ambiguous Gmail is held", async () => {
  const row = claim();
  assert.equal((await deliverEntryEmail(row, config, async () => { throw new Error("lost response"); })).outcome, "retry");
  assert.equal((await deliverEntryEmail(row, config, async () => response({}, 503))).outcome, "retry");
  for (const status of [400, 401, 403, 404, 307]) assert.equal((await deliverEntryEmail(row, config, async () => response({}, status))).outcome, "needs_review");
  for (const status of [408, 429]) assert.equal((await deliverEntryEmail(row, config, async () => response({}, status))).outcome, "retry");
  for (const status of ["retry", "needs_review"] as const) {
    assert.deepEqual(await deliverEntryEmail(row, config, async () => response({ deliveryId: row.delivery_id, status, errorCode: "ledger_busy" })), { outcome: status, errorCode: "ledger_busy" });
  }
  for (const value of [{ deliveryId: "wrong", status: "sent", providerId: "receipt" }, { deliveryId: row.delivery_id, status: "sent" }, { deliveryId: row.delivery_id, status: "unknown" }, ["sent"]]) {
    assert.equal((await deliverEntryEmail(row, config, async () => response(value))).outcome, "needs_review");
  }
  assert.equal((await deliverEntryEmail(row, config, async () => new Response("not JSON"))).outcome, "needs_review");
  assert.equal((await deliverEntryEmail(row, config, async () => new Response("x".repeat(20_000)))).outcome, "needs_review");
});

test("invalid/expired snapshots never reach transport and queuedAt is canonical", async () => {
  const row = claim();
  for (const bad of [{ ...row, delivery_id: "wrong" }, { ...row, message_text: "é".repeat(50_001) }, { ...row, queued_at: "invalid" }, { ...row, queued_at: new Date(Date.now() - 7 * 86400_000).toISOString() }]) {
    assert.equal((await deliverEntryEmail(bad, config, async () => { assert.fail("Must not send"); })).outcome, "needs_review");
  }
  assert.equal(JSON.parse(relayPayload(row)!).queuedAt, new Date(row.queued_at).toISOString());
});

test("disabled dispatcher does not query or send, and missing config does not claim jobs", async () => {
  delete process.env.ENTRY_EMAIL_ENABLED;
  assert.equal((await processEntryEmails()).enabled, false);
  process.env.ENTRY_EMAIL_ENABLED = "true";
  const original = process.env.GMAIL_RELAY_URL; delete process.env.GMAIL_RELAY_URL;
  await assert.rejects(processEntryEmails(), /configuration/);
  process.env.GMAIL_RELAY_URL = original; delete process.env.ENTRY_EMAIL_ENABLED;
});
