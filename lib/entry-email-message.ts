import "server-only";
import { createHash } from "node:crypto";
import type { AppState } from "./app-state";
import type { JobEntry } from "./types";

export const ENTRY_EMAIL_SENDER = "edu2usa@gmail.com";
export const ENTRY_EMAIL_RECIPIENT = "e.oliveira@prefmaint.com";
export const MAX_EMAIL_BYTES = 100_000;

export function entryEmailEnabled() {
  // Deliberately exact and fail closed, including missing or misspelled values.
  return process.env.ENTRY_EMAIL_ENABLED === "true";
}

export function entryDeliveryId(submissionId: string) {
  return `hours-entry-v1-${createHash("sha256").update(submissionId).digest("hex")}`;
}

// Explicit projection, not a spread of app state: never capture PINs, GPS,
// arbitrary passthrough fields, or employees unrelated to this submission.
export function formatEntryEmail(state: AppState, entry: JobEntry) {
  const name = (id: string) => state.employees.find((person) => person.id === id)?.name ?? id;
  const site = entry.rawAccountText || state.accounts.find((account) => account.id === entry.accountId)?.canonicalName || "Unknown";
  const services = entry.serviceIds.map((id) => state.services.find((service) => service.id === id)?.label.en ?? id);
  if (entry.rawServiceText) services.push(entry.rawServiceText);
  return [
    "Preferred Maintenance - New hours submission",
    `Submission ID: ${entry.id}`,
    `Submitted by: ${name(entry.submittedByEmployeeId)}`,
    `Work date: ${entry.workDate}`,
    `Account/site: ${site}`,
    `Services: ${services.join(", ") || "None selected"}`,
    `Default time: ${entry.defaultStartTime} to ${entry.defaultFinishTime}`,
    "Workers:",
    ...entry.workerLines.map((line) => `${name(line.employeeId)}: ${line.startTime} to ${line.finishTime}, ${line.approvedHours.toFixed(2)} hrs${line.overrideReason ? ` (override: ${line.overrideReason})` : ""}`),
    `Total: ${entry.workerLines.reduce((total, line) => total + line.approvedHours, 0).toFixed(2)} hrs`,
    `Status: ${entry.status}`,
    ...(entry.flags.length ? [`Flags: ${entry.flags.join(", ")}`] : []),
    ...(entry.notes ? [`Notes: ${entry.notes}`] : [])
  ].join("\n");
}
