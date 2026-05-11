import "server-only";
import { randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { getSupabaseAdmin } from "./supabase-server";

export type EmployeeCredential = {
  employeeId: string;
  username: string;
  salt: string;
  pinHash: string;
};

const credentialsKey = "employee_credentials";

export function hashPin(pin: string, salt = randomBytes(16).toString("hex")) {
  return {
    salt,
    pinHash: scryptSync(pin, salt, 32).toString("hex")
  };
}

export function verifyPin(pin: string, credential: EmployeeCredential) {
  const entered = Buffer.from(scryptSync(pin, credential.salt, 32).toString("hex"), "hex");
  const stored = Buffer.from(credential.pinHash, "hex");
  return entered.length === stored.length && timingSafeEqual(entered, stored);
}

export async function loadEmployeeCredentials() {
  const supabase = getSupabaseAdmin();
  if (!supabase) return [];
  const result = await supabase
    .from("settings")
    .select("value_json")
    .eq("key", credentialsKey)
    .maybeSingle();
  if (result.error) throw result.error;
  const value = result.data?.value_json;
  return Array.isArray(value) ? value as EmployeeCredential[] : [];
}
