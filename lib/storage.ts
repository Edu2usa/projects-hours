import type { JobEntry, Session } from "./types";

const entriesKey = "pm-hours.entries";
const draftKey = "pm-hours.draft";
const sessionKey = "pm-hours.session";

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
