import { accounts, demoEntries, employees, services } from "./demo-data";
import { getSupabaseAdmin } from "./supabase-server";
import type { AppState } from "./app-state";
import type { SupabaseClient } from "@supabase/supabase-js";

const stateKey = "app_state";
const currentStateVersion = 2;
const missingColumnError = "Supabase settings table is missing a jsonb state column.";

export const seedState: AppState = {
  version: currentStateVersion,
  accounts,
  employees,
  services,
  entries: demoEntries
};

export type LoadResult = {
  configured: boolean;
  state: AppState;
  revision: string | null;
  error?: string;
};

export type SaveResult = {
  configured: boolean;
  conflict?: boolean;
  revision?: string;
  error?: string;
};

export async function loadServerAppState(): Promise<LoadResult> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { configured: false, state: seedState, revision: null };

  const valueJsonResult = await supabase
    .from("settings")
    .select("value_json, updated_at")
    .eq("key", stateKey)
    .maybeSingle();

  if (!isIncompleteSettingsSchemaError(valueJsonResult.error)) {
    if (valueJsonResult.error) throw valueJsonResult.error;
    return {
      configured: true,
      state: normalizeState(valueJsonResult.data?.value_json),
      revision: valueJsonResult.data?.updated_at ?? null
    };
  }

  const valueResult = await supabase
    .from("settings")
    .select("value, updated_at")
    .eq("key", stateKey)
    .maybeSingle();

  if (isIncompleteSettingsSchemaError(valueResult.error)) {
    return { configured: false, state: seedState, revision: null, error: missingColumnError };
  }
  if (valueResult.error) throw valueResult.error;
  return {
    configured: true,
    state: normalizeState(valueResult.data?.value),
    revision: valueResult.data?.updated_at ?? null
  };
}

// When expectedRevision is passed, the write only succeeds if the stored row still has
// that updated_at value; otherwise it reports a conflict so the caller can reload and retry.
// This prevents concurrent submissions from silently overwriting each other's entries.
export async function saveServerAppState(state: AppState, expectedRevision?: string | null): Promise<SaveResult> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { configured: false };
  const nextState = { ...state, version: currentStateVersion };
  const nextRevision = new Date().toISOString();

  const valueJsonResult = await writeState(supabase, "value_json", nextState, nextRevision, expectedRevision);
  if (valueJsonResult) return valueJsonResult;

  const valueResult = await writeState(supabase, "value", nextState, nextRevision, expectedRevision);
  if (valueResult) return valueResult;

  return { configured: false, error: missingColumnError };
}

async function writeState(
  supabase: SupabaseClient,
  column: "value_json" | "value",
  state: AppState,
  nextRevision: string,
  expectedRevision?: string | null
): Promise<SaveResult | null> {
  if (expectedRevision) {
    const result = await supabase
      .from("settings")
      .update({ [column]: state, updated_at: nextRevision })
      .eq("key", stateKey)
      .eq("updated_at", expectedRevision)
      .select("key");
    if (isIncompleteSettingsSchemaError(result.error)) return null;
    if (result.error) throw result.error;
    if (!result.data || result.data.length === 0) return { configured: true, conflict: true };
    return { configured: true, revision: nextRevision };
  }

  const result = await supabase
    .from("settings")
    .upsert({ key: stateKey, [column]: state, updated_at: nextRevision }, { onConflict: "key" });
  if (isIncompleteSettingsSchemaError(result.error)) return null;
  if (result.error) throw result.error;
  return { configured: true, revision: nextRevision };
}

function isIncompleteSettingsSchemaError(error: unknown) {
  if (!error || typeof error !== "object" || !("code" in error)) return false;
  return error.code === "42703" || error.code === "PGRST204";
}

// Never discard stored data because of a version mismatch: real entries live in this
// record, so an unknown version is stamped with the current one instead of being
// replaced with seed data. Only a missing or structurally unusable value falls back.
function normalizeState(raw: unknown): AppState {
  if (!isUsableState(raw)) return seedState;
  return { ...raw, version: currentStateVersion };
}

function isUsableState(value: unknown): value is AppState {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<AppState>;
  return (
    Array.isArray(candidate.accounts) &&
    Array.isArray(candidate.employees) &&
    Array.isArray(candidate.services) &&
    Array.isArray(candidate.entries)
  );
}
