import { NextRequest, NextResponse } from "next/server";
import { cronAuthorized, processEntryEmails } from "../../../../lib/entry-email";

import { processNotificationTests } from "../../../../lib/notification-test";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  if (!cronAuthorized(request.headers.get("authorization"))) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  try {
    // Wait for both paths even if one fails. An optional test-ledger error must
    // not end the serverless invocation while normal email delivery is pending.
    const [emailResult, testResult] = await Promise.allSettled([processEntryEmails(), processNotificationTests()]);
    if (emailResult.status === "rejected") throw emailResult.reason;
    const emails = emailResult.value;
    const notificationTests = testResult.status === "fulfilled" ? testResult.value : { unavailable: true };
    return NextResponse.json({ ok: true, ...emails, notificationTests }, { headers: { "cache-control": "no-store" } });
  } catch {
    // Never disclose a payload, credential, provider response, or recipient list.
    return NextResponse.json({ ok: false, error: "Entry email delivery is unavailable." }, { status: 503 });
  }
}
