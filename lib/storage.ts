import type { Account, Employee, JobEntry, Service, Session } from "./types";

const accountsKey = "pm-hours.accounts";
const employeesKey = "pm-hours.employees";
const servicesKey = "pm-hours.services";
const entriesKey = "pm-hours.entries";
const draftKey = "pm-hours.draft";
const sessionKey = "pm-hours.session";

export function loadAccounts(fallback: Account[]) {
  if (typeof window === "undefined") return fallback;
  const raw = window.localStorage.getItem(accountsKey);
  return raw ? (JSON.parse(raw) as Account[]) : fallback;
}

export function saveAccounts(accounts: Account[]) {
  window.localStorage.setItem(accountsKey, JSON.stringify(accounts));
}

export function loadEmployees(fallback: Employee[]) {
  if (typeof window === "undefined") return fallback;
  const raw = window.localStorage.getItem(employeesKey);
  return raw ? (JSON.parse(raw) as Employee[]) : fallback;
}

export function saveEmployees(employees: Employee[]) {
  window.localStorage.setItem(employeesKey, JSON.stringify(employees));
}

export function loadServices(fallback: Service[]) {
  if (typeof window === "undefined") return fallback;
  const raw = window.localStorage.getItem(servicesKey);
  return raw ? (JSON.parse(raw) as Service[]) : fallback;
}

export function saveServices(services: Service[]) {
  window.localStorage.setItem(servicesKey, JSON.stringify(services));
}

export function loadEntries(fallback: JobEntry[]) {
  if (typeof window === "undefined") return fallback;
  const raw = window.localStorage.getItem(entriesKey);
  return raw ? (JSON.parse(raw) as JobEntry[]) : fallback;
}

export function saveEntries(entries: JobEntry[]) {
  window.localStorage.setItem(entriesKey, JSON.stringify(entries));
}

export function loadDraft<T>() {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(draftKey);
  return raw ? (JSON.parse(raw) as T) : null;
}

export function saveDraft<T>(draft: T) {
  window.localStorage.setItem(draftKey, JSON.stringify(draft));
}

export function clearDraft() {
  window.localStorage.removeItem(draftKey);
}

export function loadSession() {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(sessionKey);
  return raw ? (JSON.parse(raw) as Session) : null;
}

export function saveSession(session: Session) {
  window.localStorage.setItem(sessionKey, JSON.stringify(session));
}

export function clearSession() {
  window.localStorage.removeItem(sessionKey);
}
