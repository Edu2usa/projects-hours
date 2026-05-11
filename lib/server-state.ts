import { accounts, demoEntries, employees, services } from "./demo-data";
import { getSupabaseAdmin } from "./supabase-server";
import type { AppState } from "./app-state";

const stateKey = "app_state";
const currentStateVersion = 2;

export const seedState: AppState = {
  version: currentStateVersion,
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

  if (!isIncompleteSettingsSchemaError(valueJsonResult.error)) {
    if (valueJsonResult.error) throw valueJsonResult.error;
    return { configured: true, state: normalizeState((valueJsonResult.data?.value_json as AppState | null) ?? seedState) };
  }

  const valueResult = await supabase
    .from("settings")
    .select("value")
    .eq("key", stateKey)
    .maybeSingle();

  if (isIncompleteSettingsSchemaError(valueResult.error)) {
    return { configured: false, state: seedState, error: "Supabase settings table is missing a jsonb state column." };
  }
  if (valueResult.error) throw valueResult.error;
  return { configured: true, state: normalizeState((valueResult.data?.value as AppState | null) ?? seedState) };
}

export async function saveServerAppState(state: AppState) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { configured: false };
  const nextState = { ...state, version: currentStateVersion };

  const valueJsonResult = await supabase
    .from("settings")
    .upsert({ key: stateKey, value_json: nextState }, { onConflict: "key" });

  if (!isIncompleteSettingsSchemaError(valueJsonResult.error)) {
    if (valueJsonResult.error) throw valueJsonResult.error;
    return { configured: true };
  }

  const valueResult = await supabase
    .from("settings")
    .upsert({ key: stateKey, value: nextState }, { onConflict: "key" });

  if (isIncompleteSettingsSchemaError(valueResult.error)) {
    return { configured: false, error: "Supabase settings table is missing a jsonb state column." };
  }
  if (valueResult.error) throw valueResult.error;
  return { configured: true };
}

function isIncompleteSettingsSchemaError(error: unknown) {
  if (!error || typeof error !== "object" || !("code" in error)) return false;
  return error.code === "42703" || error.code === "PGRST204";
}

function normalizeState(state: AppState) {
  if (state.version !== currentStateVersion) return seedState;
  return state;
}
