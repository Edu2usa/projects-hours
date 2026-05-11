import { NextRequest, NextResponse } from "next/server";
import { createSessionToken } from "../../../../lib/auth-token";
import { loadEmployeeCredentials, verifyPin } from "../../../../lib/credentials";
import { loadServerAppState } from "../../../../lib/server-state";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as { username?: string; pin?: string };
    const username = body.username?.trim().toLowerCase();
    const pin = body.pin?.trim() ?? "";
    if (!username || !pin) return invalidLogin();

    const [{ state }, credentials] = await Promise.all([
      loadServerAppState(),
      loadEmployeeCredentials()
    ]);
    const credential = credentials.find((item) => item.username.trim().toLowerCase() === username);
    if (!credential || !verifyPin(pin, credential)) return invalidLogin();

    const employee = state.employees.find((item) => item.id === credential.employeeId && item.active);
    if (!employee) return invalidLogin();

    const session = {
      employeeId: employee.id,
      role: employee.role,
      language: employee.preferredLanguage ?? "en",
      admin: employee.role === "admin",
      token: createSessionToken({
        employeeId: employee.id,
        role: employee.role,
        language: employee.preferredLanguage ?? "en",
        admin: employee.role === "admin"
      })
    };

    return NextResponse.json({ ok: true, session });
  } catch (error) {
    return NextResponse.json({ ok: false, error: errorMessage(error) }, { status: 500 });
  }
}

function invalidLogin() {
  return NextResponse.json({ ok: false, error: "Invalid user or PIN." }, { status: 401 });
}

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return String(error);
}
