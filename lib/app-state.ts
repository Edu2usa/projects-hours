import type { Account, Employee, JobEntry, Service } from "./types";

export type AppState = {
  accounts: Account[];
  employees: Employee[];
  services: Service[];
  entries: JobEntry[];
};

export async function loadRemoteAppState() {
  const response = await fetch("/api/app-state", { cache: "no-store" });
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
  return response.ok;
}
