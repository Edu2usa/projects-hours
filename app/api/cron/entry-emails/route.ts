import { NextRequest, NextResponse } from "next/server";
import { cronAuthorized, processEntryEmails } from "../../../../lib/entry-email";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  if (!cronAuthorized(request.headers.get("authorization"))) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  try {
    return NextResponse.json({ ok: true, ...await processEntryEmails() }, { headers: { "cache-control": "no-store" } });
  } catch {
    // Never disclose a payload, credential, provider response, or recipient list.
    return NextResponse.json({ ok: false, error: "Entry email delivery is unavailable." }, { status: 503 });
  }
}
