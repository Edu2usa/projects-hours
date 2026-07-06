import { calculateHours } from "../../lib/hours";
import type { Account, Employee, JobEntry, Service, WorkerLine } from "../../lib/types";

export function normalizeName(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export function uniqueSlugId(name: string, usedIds: string[], fallback: string) {
  const base = name
    .trim()
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || fallback;
  const used = new Set(usedIds);
  let candidate = base;
  let suffix = 2;
  while (used.has(candidate)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  return candidate;
}

export function uniqueAccountId(name: string, existingAccounts: Account[]) {
  return uniqueSlugId(name, existingAccounts.map((account) => account.id), "account");
}

export function buildLine(employeeId: string, startTime: string, finishTime: string, approvedHours: number, manualOverride: boolean, overrideReason: string): WorkerLine {
  const calculatedHours = calculateHours(startTime, finishTime);
  return {
    id: crypto.randomUUID(),
    employeeId,
    startTime,
    finishTime,
    calculatedHours,
    approvedHours,
    manualOverride,
    overrideReason: overrideReason || undefined,
    paySplits: { REG: approvedHours, OT: 0, DT: 0 }
  };
}

export function accountLabel(accountList: Account[], accountId?: string, raw?: string) {
  if (raw) return raw;
  return accountList.find((account) => account.id === accountId)?.canonicalName ?? "Unknown account";
}

export function serviceSummary(serviceList: Service[], entry: JobEntry) {
  const labels = entry.serviceIds.map((serviceId) => serviceList.find((service) => service.id === serviceId)?.label.en ?? serviceId);
  return [...labels, entry.rawServiceText].filter(Boolean).join(", ") || "No service";
}

export type Totals = ReturnType<typeof summarize>;

export function summarize(entries: JobEntry[], accountList: Account[], employeeList: Employee[], serviceList: Service[]) {
  const byEmployee = new Map<string, number>();
  const byAccount = new Map<string, number>();
  const byService = new Map<string, number>();
  let totalHours = 0;

  for (const entry of entries) {
    const entryHours = entry.workerLines.reduce((sum, line) => sum + line.approvedHours, 0);
    totalHours += entryHours;
    const accountName = accountLabel(accountList, entry.accountId, entry.rawAccountText);
    byAccount.set(accountName, (byAccount.get(accountName) ?? 0) + entryHours);
    for (const serviceId of entry.serviceIds) {
      const name = serviceList.find((service) => service.id === serviceId)?.label.en ?? serviceId;
      byService.set(name, (byService.get(name) ?? 0) + entryHours);
    }
    for (const line of entry.workerLines) {
      const name = employeeList.find((employee) => employee.id === line.employeeId)?.name ?? line.employeeId;
      byEmployee.set(name, (byEmployee.get(name) ?? 0) + line.approvedHours);
    }
  }

  const toRows = (map: Map<string, number>) => [...map.entries()].map(([label, value]) => ({ label, value: value.toFixed(1) }));
  return {
    totalHours,
    byEmployee: toRows(byEmployee),
    byAccount: toRows(byAccount),
    byService: toRows(byService)
  };
}
