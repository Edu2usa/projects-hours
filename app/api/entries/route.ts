import { NextRequest, NextResponse } from "next/server";
import { verifySessionToken } from "../../../lib/auth-token";
import { loadServerAppState, saveServerAppState } from "../../../lib/server-state";
import { notifyNewEntry } from "../../../lib/telegram";
import type { JobEntry } from "../../../lib/types";

export async function POST(request: NextRequest) {
  try {
    const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    const claims = verifySessionToken(token);
    if (!claims) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

    const entry = await request.json() as JobEntry;
    const validation = validateEntry(entry, claims);
    if (validation) return NextResponse.json({ ok: false, error: validation }, { status: 400 });

    const { state } = await loadServerAppState();
    if (isExactDuplicate(state.entries, entry)) {
      return NextResponse.json({ ok: false, error: "Duplicate entry" }, { status: 409 });
    }

    const nextState = { ...state, entries: [entry, ...state.entries] };
    const result = await saveServerAppState(nextState);
    if (result.configured) {
      try {
        await notifyNewEntry(nextState, entry);
      } catch (error) {
        console.error("Telegram entry alert failed", error);
      }
    }
    return NextResponse.json({ ...result, ok: result.configured, state: nextState });
  } catch (error) {
    return NextResponse.json({ ok: false, error: errorMessage(error) }, { status: 500 });
  }
}

function validateEntry(entry: JobEntry, claims: NonNullable<ReturnType<typeof verifySessionToken>>) {
  if (!entry || typeof entry !== "object") return "Missing entry.";
  if (entry.submittedByEmployeeId !== claims.employeeId) return "Submitted-by employee does not match session.";
  if (!entry.workDate || !entry.defaultStartTime || !entry.defaultFinishTime) return "Missing date or time.";
  if (!Array.isArray(entry.workerLines) || entry.workerLines.length === 0) return "Missing worker hours.";
  if (claims.role === "worker" && entry.workerLines.some((line) => line.employeeId !== claims.employeeId)) {
    return "Workers can only submit their own hours.";
  }
  if (entry.workerLines.some((line) => !Number.isFinite(line.approvedHours) || line.approvedHours <= 0)) {
    return "Invalid approved hours.";
  }
  return null;
}

function isExactDuplicate(entries: JobEntry[], entry: JobEntry) {
  return entries.some((existing) => {
    if (existing.workerLines.length !== entry.workerLines.length) return false;
    const sameEntry =
      existing.accountId === entry.accountId &&
      (existing.rawAccountText ?? "") === (entry.rawAccountText ?? "") &&
      existing.workDate === entry.workDate &&
      existing.defaultStartTime === entry.defaultStartTime &&
      existing.defaultFinishTime === entry.defaultFinishTime;
    if (!sameEntry) return false;
    return entry.workerLines.every((line) =>
      existing.workerLines.some((existingLine) =>
        existingLine.employeeId === line.employeeId &&
        existingLine.startTime === line.startTime &&
        existingLine.finishTime === line.finishTime &&
        existingLine.approvedHours === line.approvedHours
      )
    );
  });
}

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return String(error);
}
