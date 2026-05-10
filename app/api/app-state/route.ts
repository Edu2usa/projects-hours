import { NextRequest, NextResponse } from "next/server";
import { loadServerAppState, saveServerAppState } from "../../../lib/server-state";
import type { AppState } from "../../../lib/app-state";

export async function GET() {
  try {
    return NextResponse.json(await loadServerAppState());
  } catch (error) {
    return NextResponse.json({ configured: true, error: errorMessage(error) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const state = await request.json() as AppState;
    const result = await saveServerAppState(state);
    return NextResponse.json({ ...result, ok: result.configured });
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
