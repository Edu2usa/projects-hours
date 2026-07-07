"use client";

import { useState } from "react";
import { Check, Download, FileSpreadsheet, FileText, Search } from "lucide-react";
import { calculateHours, flagEntry, roundApprovedHours } from "../../lib/hours";
import { formatDisplayDate, type PayrollPeriod } from "../../lib/payroll";
import type { Account, Employee, JobEntry, Service } from "../../lib/types";
import { AccountManager } from "./AccountManager";
import type { AdminEditDraft } from "./drafts";
import { EmployeeManager } from "./EmployeeManager";
import { accountLabel, normalizeName, serviceSummary, uniqueAccountId, type Totals } from "./helpers";
import { ServiceManager } from "./ServiceManager";
import { HeaderLine, ReportList, Stat } from "./ui";

export function AdminDashboard({ entries, setEntries, accounts, setAccounts, employees, setEmployees, services, setServices, totals, payrollPeriod, flaggedEntries, adminSaveNotice, saveAdminState }: {
  entries: JobEntry[];
  setEntries: (entries: JobEntry[]) => void;
  accounts: Account[];
  setAccounts: (accounts: Account[]) => void;
  employees: Employee[];
  setEmployees: (employees: Employee[]) => void;
  services: Service[];
  setServices: (services: Service[]) => void;
  totals: Totals;
  payrollPeriod: PayrollPeriod;
  flaggedEntries: JobEntry[];
  adminSaveNotice: string | null;
  saveAdminState: (nextState: Partial<{ accounts: Account[]; employees: Employee[]; services: Service[]; entries: JobEntry[] }>) => void | Promise<void>;
}) {
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<AdminEditDraft | null>(null);
  const [editNotice, setEditNotice] = useState<string | null>(null);

  function resolve(entryId: string) {
    setEntries(entries.map((entry) => entry.id === entryId ? { ...entry, status: "approved", flags: [] } : entry));
  }

  function startEditEntry(entry: JobEntry) {
    setEditingEntryId(entry.id);
    setEditNotice(null);
    setEditDraft({
      accountId: entry.rawAccountText ? "other" : entry.accountId ?? "",
      rawAccountText: entry.rawAccountText ?? "",
      workDate: entry.workDate,
      defaultStartTime: entry.defaultStartTime,
      defaultFinishTime: entry.defaultFinishTime,
      serviceIds: entry.serviceIds,
      rawServiceText: entry.rawServiceText ?? "",
      notes: entry.notes ?? "",
      workerLines: entry.workerLines.map((line) => ({
        id: line.id,
        employeeId: line.employeeId,
        startTime: line.startTime,
        finishTime: line.finishTime,
        approvedHours: String(line.approvedHours),
        overrideReason: line.overrideReason ?? ""
      }))
    });
  }

  function cancelEditEntry() {
    setEditingEntryId(null);
    setEditDraft(null);
    setEditNotice(null);
  }

  function updateWorkerLine(lineId: string, partial: Partial<AdminEditDraft["workerLines"][number]>) {
    if (!editDraft) return;
    setEditDraft({
      ...editDraft,
      workerLines: editDraft.workerLines.map((line) => line.id === lineId ? { ...line, ...partial } : line)
    });
  }

  function toggleEditService(serviceId: string) {
    if (!editDraft) return;
    const serviceIds = editDraft.serviceIds.includes(serviceId)
      ? editDraft.serviceIds.filter((id) => id !== serviceId)
      : [...editDraft.serviceIds, serviceId];
    setEditDraft({ ...editDraft, serviceIds });
  }

  function saveEntryEdit(entry: JobEntry) {
    if (!editDraft) return;
    const hasAccount = editDraft.accountId && (editDraft.accountId !== "other" || editDraft.rawAccountText.trim());
    const hasService = editDraft.serviceIds.length > 0 || editDraft.rawServiceText.trim();
    if (!hasAccount) {
      setEditNotice("Choose a customer/account or enter the Other account name.");
      return;
    }
    if (!hasService) {
      setEditNotice("Choose at least one service/type of job or enter Other service.");
      return;
    }

    const nextWorkerLines = editDraft.workerLines.map((line) => {
      const approvedHours = roundApprovedHours(Number.parseFloat(line.approvedHours));
      const calculatedHours = calculateHours(line.startTime, line.finishTime);
      const manualOverride = Number.isFinite(approvedHours) && Math.abs(approvedHours - calculatedHours) > 0.01;
      return {
        id: line.id,
        employeeId: line.employeeId,
        startTime: line.startTime,
        finishTime: line.finishTime,
        calculatedHours,
        approvedHours,
        manualOverride,
        overrideReason: line.overrideReason || undefined,
        paySplits: { REG: approvedHours, OT: 0, DT: 0 }
      };
    });

    if (nextWorkerLines.some((line) => !line.employeeId || !Number.isFinite(line.approvedHours) || line.approvedHours <= 0)) {
      setEditNotice("Every worker row needs a worker and hours greater than zero.");
      return;
    }

    const rawAccountText = editDraft.accountId === "other" ? editDraft.rawAccountText.trim() : undefined;
    const rawServiceText = editDraft.rawServiceText.trim() || undefined;
    const maxHours = Math.max(...nextWorkerLines.map((line) => line.approvedHours));
    const flags = flagEntry({
      workDate: editDraft.workDate,
      rawAccountText,
      rawServiceText,
      manualOverride: nextWorkerLines.some((line) => line.manualOverride),
      hours: maxHours
    });
    const nextEntry: JobEntry = {
      ...entry,
      accountId: editDraft.accountId === "other" ? undefined : editDraft.accountId,
      rawAccountText,
      workDate: editDraft.workDate,
      defaultStartTime: editDraft.defaultStartTime,
      defaultFinishTime: editDraft.defaultFinishTime,
      defaultCalculatedHours: calculateHours(editDraft.defaultStartTime, editDraft.defaultFinishTime),
      serviceIds: editDraft.serviceIds,
      rawServiceText,
      notes: editDraft.notes || undefined,
      workerLines: nextWorkerLines,
      flags,
      status: flags.length ? "flagged" : "approved"
    };
    saveAdminState({ entries: entries.map((item) => item.id === entry.id ? nextEntry : item) });
    setEditingEntryId(null);
    setEditDraft(null);
    setEditNotice("Entry updated.");
  }

  function createCustomerFromRaw(entry: JobEntry) {
    const canonicalName = (entry.rawAccountText ?? "").trim();
    if (!canonicalName) return;
    const existingAccount = accounts.find((account) => normalizeName(account.canonicalName) === normalizeName(canonicalName));
    const nextAccount = existingAccount ?? {
      id: uniqueAccountId(canonicalName, accounts),
      canonicalName,
      active: true,
      isFavorite: false
    };
    const nextAccounts = existingAccount ? accounts : [...accounts, nextAccount];
    const nextEntries = entries.map((item) => {
      if (item.id !== entry.id) return item;
      const remainingFlags = item.flags.filter((flag) => flag !== "Other account needs cleanup");
      return {
        ...item,
        accountId: nextAccount.id,
        rawAccountText: undefined,
        flags: remainingFlags,
        status: remainingFlags.length ? item.status : "approved"
      };
    });
    saveAdminState({ accounts: nextAccounts, entries: nextEntries });
  }

  return (
    <section className="grid">
      {adminSaveNotice && <div className={`feedback-banner ${adminSaveNotice.startsWith("Not saved") ? "error" : "success"}`} role="status">{adminSaveNotice}</div>}
      <div className="grid three">
        <Stat label="Pending flags" value={flaggedEntries.length} />
        <Stat label={`Payroll hours (${payrollPeriod.label})`} value={totals.totalHours.toFixed(1)} />
        <Stat label="Employees" value={employees.filter((employee) => employee.active).length} />
      </div>
      <div className="panel grid">
        <HeaderLine
          title={`Payroll ${payrollPeriod.label}`}
          subtitle={`Week 1 ends ${formatDisplayDate(payrollPeriod.week1End)}, week 2 ends ${formatDisplayDate(payrollPeriod.end)}. Hours dated after ${formatDisplayDate(payrollPeriod.end)} go to the next payroll. Resolve flags, classify REG/OT/DT, then export.`}
          right={
            <div className="segmented">
              <a className="secondary" href={`/api/export/report?period=${payrollPeriod.end}`} target="_blank" rel="noreferrer"><FileText size={18} /> Report</a>
              <a className="secondary" href={`/api/export/excel?period=${payrollPeriod.end}`}><FileSpreadsheet size={18} /> Excel</a>
              <a className="secondary" href={`/api/export/pdf?period=${payrollPeriod.end}`}><Download size={18} /> PDF</a>
            </div>
          }
        />
        <div className="row">
          <span className="small muted">Last payroll (closed):</span>
          <div className="segmented master-data-actions">
            <a className="secondary" href="/api/export/report?period=previous" target="_blank" rel="noreferrer">Report</a>
            <a className="secondary" href="/api/export/excel?period=previous">Excel</a>
            <a className="secondary" href="/api/export/pdf?period=previous">PDF</a>
            <a className="secondary" href="/api/export/excel?period=all">All history (Excel)</a>
          </div>
        </div>
        <div className="grid three">
          <ReportList title="By employee" rows={totals.byEmployee} />
          <ReportList title="By account" rows={totals.byAccount} />
          <ReportList title="By service" rows={totals.byService} />
        </div>
      </div>
      <div className="panel grid">
        <HeaderLine title="Admin queue" subtitle="Other text, overrides, old entries, duplicates, corrections" />
        <div className="list">
          {flaggedEntries.map((entry) => (
            <div className="row" key={entry.id}>
              <div>
                <strong>{accountLabel(accounts, entry.accountId, entry.rawAccountText)}</strong>
                <div className="small muted">{entry.workDate} / {entry.flags.join(", ") || "Cleanup needed"}</div>
                {entry.rawAccountText && <div className="small muted">Raw account: {entry.rawAccountText}</div>}
              </div>
              <div className="segmented master-data-actions">
                {entry.rawAccountText && <button className="primary" onClick={() => createCustomerFromRaw(entry)}>Add customer</button>}
                <button className="secondary" onClick={() => startEditEntry(entry)}>Edit</button>
                <button className="secondary" onClick={() => resolve(entry.id)} disabled={Boolean(entry.rawAccountText)}>Resolve</button>
              </div>
            </div>
          ))}
          {flaggedEntries.length === 0 && <p className="muted">No pending flags.</p>}
        </div>
      </div>
      <div className="panel grid">
        <HeaderLine title="Entry corrections" subtitle="Edit submitted data before reports and exports." />
        {editNotice && <p className="small muted" role="status">{editNotice}</p>}
        <div className="list">
          {entries.map((entry) => (
            <div className="card grid" key={`edit-${entry.id}`}>
              <div className="row">
                <div>
                  <strong>{accountLabel(accounts, entry.accountId, entry.rawAccountText)}</strong>
                  <div className="small muted">{entry.workDate} / {entry.workerLines.reduce((sum, line) => sum + line.approvedHours, 0).toFixed(2)} hours / {serviceSummary(services, entry)}</div>
                </div>
                <button className="secondary" onClick={() => startEditEntry(entry)}>Edit</button>
              </div>
              {editingEntryId === entry.id && editDraft && (
                <div className="grid admin-edit-form">
                  <div className="grid three">
                    <div className="field">
                      <label>Customer/account</label>
                      <select className="select" value={editDraft.accountId} onChange={(event) => setEditDraft({ ...editDraft, accountId: event.target.value })}>
                        <option value="">Choose account</option>
                        {accounts.filter((account) => account.active).map((account) => <option key={account.id} value={account.id}>{account.canonicalName}</option>)}
                        <option value="other">Other / needs cleanup</option>
                      </select>
                    </div>
                    <div className="field">
                      <label>Work date</label>
                      <input className="input" type="date" value={editDraft.workDate} onChange={(event) => setEditDraft({ ...editDraft, workDate: event.target.value })} />
                    </div>
                    <div className="field">
                      <label>Default time</label>
                      <div className="grid two">
                        <input className="input" type="time" value={editDraft.defaultStartTime} onChange={(event) => setEditDraft({ ...editDraft, defaultStartTime: event.target.value })} aria-label="Default start time" />
                        <input className="input" type="time" value={editDraft.defaultFinishTime} onChange={(event) => setEditDraft({ ...editDraft, defaultFinishTime: event.target.value })} aria-label="Default finish time" />
                      </div>
                    </div>
                  </div>
                  {editDraft.accountId === "other" && (
                    <div className="field">
                      <label>Other account text</label>
                      <input className="input" value={editDraft.rawAccountText} onChange={(event) => setEditDraft({ ...editDraft, rawAccountText: event.target.value })} />
                    </div>
                  )}
                  <div className="grid">
                    <label className="muted small">Type of job / services</label>
                    <div className="segmented">
                      {services.filter((service) => service.active).map((service) => (
                        <button key={service.id} className={`chip ${editDraft.serviceIds.includes(service.id) ? "active" : ""}`} aria-pressed={editDraft.serviceIds.includes(service.id)} onClick={() => toggleEditService(service.id)}>
                          {editDraft.serviceIds.includes(service.id) ? <Check size={16} /> : <Search size={16} />} {service.label.en}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="field">
                    <label>Other service/type of job</label>
                    <input className="input" value={editDraft.rawServiceText} onChange={(event) => setEditDraft({ ...editDraft, rawServiceText: event.target.value })} />
                  </div>
                  <div className="grid">
                    <strong>Worker hours</strong>
                    {editDraft.workerLines.map((line) => (
                      <div className="row admin-worker-edit" key={line.id}>
                        <select className="select" value={line.employeeId} onChange={(event) => updateWorkerLine(line.id, { employeeId: event.target.value })} aria-label="Worker">
                          {employees.filter((employee) => employee.active).map((employee) => <option key={employee.id} value={employee.id}>{employee.name}</option>)}
                        </select>
                        <input className="input" type="time" value={line.startTime} onChange={(event) => updateWorkerLine(line.id, { startTime: event.target.value })} aria-label="Start time" />
                        <input className="input" type="time" value={line.finishTime} onChange={(event) => updateWorkerLine(line.id, { finishTime: event.target.value })} aria-label="Finish time" />
                        <input
                          className="input"
                          inputMode="decimal"
                          value={line.approvedHours}
                          onChange={(event) => updateWorkerLine(line.id, { approvedHours: event.target.value })}
                          onBlur={(event) => {
                            const rounded = roundApprovedHours(Number(event.target.value));
                            if (Number.isFinite(rounded) && rounded > 0) updateWorkerLine(line.id, { approvedHours: String(rounded) });
                          }}
                          aria-label="Approved hours"
                        />
                        <input className="input" value={line.overrideReason} onChange={(event) => updateWorkerLine(line.id, { overrideReason: event.target.value })} placeholder="Reason/note" aria-label="Override reason" />
                      </div>
                    ))}
                  </div>
                  <div className="field">
                    <label>Notes</label>
                    <textarea className="textarea" value={editDraft.notes} onChange={(event) => setEditDraft({ ...editDraft, notes: event.target.value })} />
                  </div>
                  <div className="segmented master-data-actions">
                    <button className="primary" onClick={() => saveEntryEdit(entry)}>Save entry</button>
                    <button className="secondary" onClick={cancelEditEntry}>Cancel</button>
                  </div>
                </div>
              )}
            </div>
          ))}
          {entries.length === 0 && <p className="muted">No submitted entries yet.</p>}
        </div>
      </div>
      <div className="panel grid">
        <HeaderLine title="Master data" subtitle="Seeded employees, customer/accounts, and services" />
        <div className="grid three">
          <EmployeeManager employees={employees} setEmployees={setEmployees} entries={entries} />
          <AccountManager accounts={accounts} setAccounts={setAccounts} entries={entries} />
          <ServiceManager services={services} setServices={setServices} entries={entries} />
        </div>
      </div>
    </section>
  );
}
