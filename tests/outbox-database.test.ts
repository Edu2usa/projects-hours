import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { entryDeliveryId } from "../lib/entry-email-message";
import { entry, state } from "./fixtures";

const migration = readFileSync("supabase/migrations/202611070001_entry_email_outbox.sql", "utf8");
async function database(column = "value_json") {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create table public.settings(key text primary key, ${column} jsonb not null, updated_at timestamptz not null default clock_timestamp());`);
  await db.query(`insert into settings(key, ${column}) values ('app_state', $1)`, [JSON.stringify({ ...state, entries: [{ ...entry, id: "historic" }] })]);
  await db.exec(migration);
  return db;
}
async function revision(db: PGlite) {
  return (await db.query<{ revision: string }>("select updated_at::text as revision from settings where key='app_state'")).rows[0].revision;
}
async function save(db: PGlite, id: string, options: { enabled?: boolean; revision?: string; deliveryId?: string; text?: string } = {}) {
  const rev = options.revision ?? await revision(db);
  return (await db.query<{ result: { configured: boolean; duplicate?: boolean; conflict?: boolean } }>(
    "select save_hours_entry_with_email($1::jsonb,$2::timestamptz,$3,$4,$5) as result",
    [JSON.stringify({ ...entry, id }), rev, options.enabled ?? true, options.deliveryId ?? entryDeliveryId(id), options.text ?? `Submission ID: ${id}`]
  )).rows[0].result;
}
async function rows(db: PGlite) { return (await db.query<Record<string, unknown>>("select * from entry_email_outbox order by queued_at")).rows; }
async function claim(db: PGlite) { return (await db.query<{ submission_id: string; lease_token: string; attempts: number }>("select * from claim_entry_emails(5)")).rows; }
async function finish(db: PGlite, row: { submission_id: string; lease_token: string }, outcome: string) {
  return (await db.query<{ ok: boolean }>("select finish_entry_email($1,$2,$3,$4) as ok", [row.submission_id, row.lease_token, outcome, outcome === "sent" ? null : "test_error"])).rows[0].ok;
}

test("migration is repeatable and queues no historic/imported/restored/disabled entries", async () => {
  const db = await database();
  try {
    await db.exec(migration);
    assert.equal((await rows(db)).length, 0);
    assert.equal((await save(db, "historic")).duplicate, true);
    await save(db, "disabled", { enabled: false });
    assert.equal((await rows(db)).length, 0);
    await db.query("update settings set value_json=$1 where key='app_state'", [JSON.stringify({ ...state, entries: [{ ...entry, id: "admin-import" }] })]);
    assert.equal((await rows(db)).length, 0);
    await db.query("update settings set value_json=$1 where key='app_state'", [JSON.stringify(state)]);
    for (const id of ["historic", "disabled", "admin-import"]) assert.equal((await save(db, id)).duplicate, true);
    await save(db, "new");
    assert.deepEqual((await rows(db)).map((r) => r.submission_id), ["new"]);
  } finally { await db.close(); }
});

test("entry/outbox are atomic; revision conflicts cannot overwrite; duplicate ID cannot change payload", async () => {
  const db = await database();
  try {
    const rev = await revision(db);
    await assert.rejects(save(db, "rollback", { deliveryId: "bad" }), /check constraint/);
    assert.equal((await rows(db)).length, 0);
    assert.equal(await revision(db), rev);
    assert.equal((await db.query("select * from hours_submission_receipts where submission_id='rollback'")).rows.length, 0);
    const results = await Promise.all([save(db, "one", { revision: rev }), save(db, "two", { revision: rev })]);
    assert.equal(results.filter((r) => r.conflict).length, 1);
    await save(db, "two");
    assert.equal((await rows(db)).length, 2);
    const before = await rows(db);
    assert.equal((await save(db, "one", { text: "changed" })).duplicate, true);
    assert.deepEqual(await rows(db), before);
    await assert.rejects(db.query("update entry_email_outbox set message_text='tampered' where submission_id='one'"), /immutable/);
    await db.query("update settings set value_json=jsonb_set(value_json,'{employees}','[]')");
    assert.deepEqual(await rows(db), before);
  } finally { await db.close(); }
});

test("supports legacy value column and holds oversized snapshots without rejecting hours", async () => {
  const db = await database("value");
  try {
    await save(db, "oversize", { text: "é".repeat(50_001) });
    const queue = await rows(db);
    assert.equal(queue[0].status, "needs_review");
    assert.equal(queue[0].message_text, null);
    assert.equal((await db.query("select 1 from settings, jsonb_array_elements(value->'entries') item where item->>'id'='oversize'")).rows.length, 1);
  } finally { await db.close(); }
});

test("concurrent claims, leases, backoff, stale completion and ten-attempt cap", async () => {
  const db = await database();
  try {
    for (let i = 0; i < 6; i++) await save(db, `job-${i}`);
    const [batchA, batchB] = await Promise.all([claim(db), claim(db)]);
    assert.equal(batchA.length, 5); assert.equal(batchB.length, 1);
    assert.equal(new Set([...batchA, ...batchB].map((r) => r.submission_id)).size, 6);
    assert.equal((await claim(db)).length, 0);
    const first = batchA[0];
    assert.equal(await finish(db, { ...first, lease_token: "00000000-0000-0000-0000-000000000000" }, "sent"), false);
    assert.equal(await finish(db, first, "retry"), true);
    assert.equal((await claim(db)).length, 0);
    const backoff = (await db.query<{ minutes: number }>("select extract(epoch from (next_attempt_at-clock_timestamp()))/60 as minutes from entry_email_outbox where submission_id=$1", [first.submission_id])).rows[0];
    assert.ok(Number(backoff.minutes) > 9 && Number(backoff.minutes) <= 10);
    await db.query("update entry_email_outbox set next_attempt_at=clock_timestamp()-interval '1 second' where submission_id=$1", [first.submission_id]);
    const second = (await claim(db))[0];
    assert.equal(second.attempts, 2); assert.notEqual(second.lease_token, first.lease_token);
    assert.equal(await finish(db, first, "sent"), false);
    await db.query("update entry_email_outbox set lease_until=clock_timestamp()-interval '1 second' where submission_id=$1", [second.submission_id]);
    const recovered = (await claim(db))[0];
    assert.equal(recovered.attempts, 3); assert.equal(await finish(db, second, "sent"), false);
    await db.query("update entry_email_outbox set attempts=10 where submission_id=$1", [recovered.submission_id]);
    assert.equal(await finish(db, recovered, "retry"), true);
    const held = (await rows(db)).find((r) => r.submission_id === first.submission_id)!;
    assert.equal(held.status, "needs_review"); assert.equal(held.last_error, "retry_limit");
    assert.equal(await finish(db, batchB[0], "sent"), true);
    assert.equal(await finish(db, batchA[1], "needs_review"), true);
    assert.equal((await claim(db)).length, 0);
  } finally { await db.close(); }
});

test("expired snapshots are held and clients cannot read tables or execute RPCs", async () => {
  const db = await database();
  try {
    await save(db, "expired");
    // Owner-only test fixture aging. Production callers cannot alter snapshots.
    await db.exec("alter table entry_email_outbox disable trigger protect_entry_email_snapshot; update entry_email_outbox set queued_at=clock_timestamp()-interval '8 days'; alter table entry_email_outbox enable trigger protect_entry_email_snapshot;");
    assert.equal((await claim(db)).length, 0);
    assert.equal((await rows(db))[0].last_error, "queue_expired");
    for (const role of ["anon", "authenticated"]) {
      await db.exec(`set role ${role}`);
      for (const sql of ["select * from entry_email_outbox", "select * from hours_submission_receipts", "select * from claim_entry_emails(5)", "select save_hours_entry_with_email('{}',null,false,null,null)", "select finish_entry_email('x',gen_random_uuid(),'sent',null)"]) await assert.rejects(db.exec(sql), /permission denied/);
      await db.exec("reset role");
    }
    await db.exec("set role service_role");
    assert.equal((await claim(db)).length, 0);
    await assert.rejects(db.exec("select * from entry_email_outbox"), /permission denied/);
    await db.exec("reset role");
  } finally { await db.close(); }
});
