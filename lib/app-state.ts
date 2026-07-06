import type { Account, Employee, JobEntry, Service } from "./types";

export type AppState = {
  version: number;
  accounts: Account[];
  employees: Employee[];
  services: Service[];
  entries: JobEntry[];
};

export async function loadRemoteAppState() {
  const response = await fetch(`/api/app-state?ts=${Date.now()}`, { cache: "no-store" });
  if (!response.ok) return null;
  const payload = await response.json() as { configured?: boolean; state?: AppState };
  return payload.configured && payload.state ? payload.state : null;
}

export async function saveRemoteAppState(state: AppState, token?: string) {
  const response = await fetch("/api/app-state", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify(state)
  });
  if (!response.ok) return null;
  const payload = await response.json() as { state?: AppState };
  return payload.state ?? state;
}

export type RemoteEntryResult = {
  ok: boolean;
  // HTTP status; 0 means the request never reached the server (offline/network error)
  status: number;
  state: AppState | null;
  error?: string;
};

export async function saveRemoteEntry(entry: JobEntry, token?: string): Promise<RemoteEntryResult> {
  try {
    const response = await fetch("/api/entries", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {})
      },
      body: JSON.stringify(entry)
    });
    const payload = await response.json().catch(() => ({})) as { ok?: boolean; state?: AppState; error?: string };
    return {
      ok: response.ok && payload.ok !== false,
      status: response.status,
      state: payload.state ?? null,
      error: payload.error
    };
  } catch (error) {
    return { ok: false, status: 0, state: null, error: error instanceof Error ? error.message : String(error) };
  }
}

// Session tokens carry their expiry in the payload half of "payload.signature".
// Checking it client-side lets the app force a fresh login before the employee
// types out an entry that the server would reject with a 401.
export function isSessionTokenExpired(token: string) {
  try {
    const encoded = token.split(".")[0].replace(/-/g, "+").replace(/_/g, "/");
    const claims = JSON.parse(atob(encoded)) as { exp?: number };
    return !claims.exp || claims.exp * 1000 < Date.now();
  } catch {
    return true;
  }
}
