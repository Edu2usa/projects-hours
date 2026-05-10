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

  const { data, error } = await supabase
    .from("settings")
    .select("value_json")
    .eq("key", stateKey)
    .maybeSingle();

  if (error) throw error;
  return { configured: true, state: (data?.value_json as AppState | null) ?? seedState };
}

export async function saveServerAppState(state: AppState) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { configured: false };

  const { error } = await supabase
    .from("settings")
    .upsert({ key: stateKey, value_json: state }, { onConflict: "key" });

  if (error) throw error;
  return { configured: true };
}
