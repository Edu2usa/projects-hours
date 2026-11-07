import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";

const migration = readFileSync("supabase/migrations/202611070002_notification_tests.sql", "utf8");
const testId = "notification-test-v1-00000000-0000-4000-8000-000000000001";
type Claim = { test_id: string; channel: string; claim_token: string };
async function database() {
  const db = new PGlite();
  await db.exec("create role anon; create role authenticated; create role service_role bypassrls;");
  await db.exec(migration);
  return db;
}
async function queue(db: PGlite) {
  await db.query("insert into notification_test_deliveries(test_id,channel) values ($1,'gmail'),($1,'telegram') on conflict do nothing", [testId]);
}
async function claim(db: PGlite) { return (await db.query<Claim>("select * from claim_notification_tests()")).rows; }
async function finish(db: PGlite, row: Claim, status = "sent") {
  return (await db.query<{ok: boolean}>("select finish_notification_test($1,$2,$3,$4,$5) as ok", [row.test_id, row.channel, row.claim_token, status, { providerId: "mock" }])).rows[0].ok;
}

test("test migration queues nothing, needs no payroll tables, and is repeatable", async () => {
  const db = await database();
  try {
    await db.exec(migration);
    assert.deepEqual(await claim(db), []);
    assert.equal((await db.query("select * from notification_test_deliveries")).rows.length, 0);
    await queue(db); await queue(db);
    assert.equal((await db.query("select * from notification_test_deliveries")).rows.length, 2);
    await assert.rejects(db.exec("update notification_test_deliveries set queued_at=clock_timestamp()"), /immutable/);
  } finally { await db.close(); }
});

test("each channel is claimed only once, stale or duplicate completion cannot resend", async () => {
  const db = await database();
  try {
    await queue(db);
    const [a,b] = await Promise.all([claim(db),claim(db)]);
    assert.equal(a.length+b.length, 2);
    const rows = [...a,...b];
    assert.equal(await finish(db, {...rows[0], claim_token: "00000000-0000-0000-0000-000000000000"}), false);
    assert.equal(await finish(db, rows[0]), true);
    assert.equal(await finish(db, rows[0]), false);
    await db.exec("update notification_test_deliveries set claimed_at=clock_timestamp()-interval '6 minutes' where status='sending'");
    assert.deepEqual(await claim(db), []);
    assert.equal(await finish(db, rows[1]), false);
    const held = (await db.query<{result: {errorCode: string}}>("select result from notification_test_deliveries where status='needs_review'")).rows;
    assert.equal(held[0].result.errorCode, "outcome_unknown");
    await queue(db); assert.deepEqual(await claim(db), []);
  } finally { await db.close(); }
});

test("expired and future tests do not send; client/service roles cannot queue or read tests", async () => {
  const db = await database();
  try {
    await db.query("insert into notification_test_deliveries(test_id,channel,queued_at) values ($1,'gmail',clock_timestamp()-interval '2 days'),($1,'telegram',clock_timestamp()+interval '2 days')", [testId]);
    assert.deepEqual(await claim(db), []);
    for (const role of ["anon", "authenticated", "service_role"]) {
      await db.exec(`set role ${role}`);
      for (const sql of ["select * from notification_test_deliveries", `insert into notification_test_deliveries(test_id,channel) values ('${testId}','gmail')`, "delete from notification_test_deliveries"])
        await assert.rejects(db.exec(sql), /permission denied/);
      if (role !== "service_role") {
        await assert.rejects(db.exec("select * from claim_notification_tests()"), /permission denied/);
        await assert.rejects(db.exec("select finish_notification_test('x','gmail',gen_random_uuid(),'sent','{}')"), /permission denied/);
      } else assert.deepEqual(await claim(db), []);
      await db.exec("reset role");
    }
    await assert.rejects(db.exec("select finish_notification_test('x','gmail',gen_random_uuid(),'pending','{}')"), /Invalid test result/);
  } finally { await db.close(); }
});
