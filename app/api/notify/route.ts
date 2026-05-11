import { NextRequest, NextResponse } from "next/server";
import { sendTelegramMessage } from "../../../lib/telegram";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const text = body.text || "Preferred Maintenance hours notification";
  const result = await sendTelegramMessage(text);

  if (!result.configured) {
    return NextResponse.json({ ok: false, skipped: true, reason: "Telegram env vars are not configured." });
  }

  return NextResponse.json({ ok: result.results.every((item) => item.ok), results: result.results });
}
