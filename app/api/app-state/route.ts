import { NextRequest, NextResponse } from "next/server";
import { loadServerAppState, saveServerAppState } from "../../../lib/server-state";
import type { AppState } from "../../../lib/app-state";

export async function GET() {
  try {
    return NextResponse.json(await loadServerAppState());
  } catch (error) {
    return NextResponse.json({ configured: true, error: error instanceof Error ? error.message : "Unknown Supabase error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const state = await request.json() as AppState;
    const result = await saveServerAppState(state);
    return NextResponse.json({ ...result, ok: result.configured });
  } catch (error) {
    return NextResponse.json({ configured: true, error: error instanceof Error ? error.message : "Unknown Supabase error" }, { status: 500 });
  }
}
