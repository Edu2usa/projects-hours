import { NextRequest, NextResponse } from "next/server";
import { loadServerAppState } from "../../../../lib/server-state";
import { notifyWeeklyReport } from "../../../../lib/telegram";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const authorization = request.headers.get("authorization");
    const querySecret = request.nextUrl.searchParams.get("secret");
    const allowed = authorization === `Bearer ${secret}` || querySecret === secret;
    if (!allowed) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }
  }

  const { configured, state } = await loadServerAppState();
  if (!configured) {
    return NextResponse.json({ ok: false, error: "Supabase app state is not configured." }, { status: 503 });
  }

  const result = await notifyWeeklyReport(state, appOrigin(request));
  return NextResponse.json({ ok: result.configured && result.results.every((item) => item.ok), ...result });
}

function appOrigin(request: NextRequest) {
  const configured = process.env.APP_BASE_URL || process.env.NEXT_PUBLIC_APP_URL;
  if (configured) return configured.replace(/\/$/, "");

  const productionUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;
  if (productionUrl) return `https://${productionUrl.replace(/^https?:\/\//, "").replace(/\/$/, "")}`;

  return request.nextUrl.origin;
}
