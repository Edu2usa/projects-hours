import { accounts, demoEntries, employees, services } from "./demo-data";
import { getSupabaseAdmin } from "./supabase-server";
import type { AppState } from "./app-state";

const stateKey = "app_state";

export const seedState: AppState = {
  accounts,
  employees,
  services,
  entries: demoEntries
};

export async function loadServerAppState() {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { configured: false, state: seedState };

  const valueJsonResult = await supabase
    .from("settings")
    .select("value_json")
    .eq("key", stateKey)
    .maybeSingle();

  if (!isMissingColumnError(valueJsonResult.error)) {
    if (valueJsonResult.error) throw valueJsonResult.error;
    return { configured: true, state: (valueJsonResult.data?.value_json as AppState | null) ?? seedState };
  }

  const valueResult = await supabase
    .from("settings")
    .select("value")
    .eq("key", stateKey)
    .maybeSingle();

  if (valueResult.error) throw valueResult.error;
  return { configured: true, state: (valueResult.data?.value as AppState | null) ?? seedState };
}

export async function saveServerAppState(state: AppState) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { configured: false };

  const valueJsonResult = await supabase
    .from("settings")
    .upsert({ key: stateKey, value_json: state }, { onConflict: "key" });

  if (!isMissingColumnError(valueJsonResult.error)) {
    if (valueJsonResult.error) throw valueJsonResult.error;
    return { configured: true };
  }

  const valueResult = await supabase
    .from("settings")
    .upsert({ key: stateKey, value: state }, { onConflict: "key" });

  if (valueResult.error) throw valueResult.error;
  return { configured: true };
}

function isMissingColumnError(error: unknown) {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "42703");
}
