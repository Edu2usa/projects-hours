import { NextRequest, NextResponse } from "next/server";
import { verifySessionToken } from "../../../lib/auth-token";
import { appStateSchema, describeZodError } from "../../../lib/app-state-schema";
import { loadServerAppState, saveServerAppState } from "../../../lib/server-state";
import type { AppState } from "../../../lib/app-state";

export async function GET() {
  try {
    return NextResponse.json(await loadServerAppState(), {
      headers: {
        "cache-control": "no-store, max-age=0"
      }
    });
  } catch (error) {
    return NextResponse.json({ configured: true, error: errorMessage(error) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    const claims = verifySessionToken(token);
    if (!claims) return NextResponse.json({ configured: true, error: "Unauthorized" }, { status: 401 });
    if (!claims.admin) return NextResponse.json({ configured: true, error: "Admin required" }, { status: 403 });
    const parsed = appStateSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ configured: true, ok: false, error: describeZodError(parsed.error) }, { status: 400 });
    }
    const state = parsed.data as AppState;
    const result = await saveServerAppState(state);
    return NextResponse.json({ ...result, ok: result.configured, state: result.configured ? state : undefined }, {
      headers: {
        "cache-control": "no-store, max-age=0"
      }
    });
  } catch (error) {
    return NextResponse.json({ configured: true, error: errorMessage(error) }, { status: 500 });
  }
}

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object") {
    const maybeError = error as { message?: unknown; code?: unknown; details?: unknown; hint?: unknown };
    return JSON.stringify({
      code: maybeError.code,
      message: maybeError.message,
      details: maybeError.details,
      hint: maybeError.hint
    });
  }
  return String(error);
}
