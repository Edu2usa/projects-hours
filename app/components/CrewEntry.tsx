"use client";

import { useState } from "react";
import { AlertTriangle, Plus, Trash2 } from "lucide-react";
import { calculateHours, flagEntry, roundApprovedHours } from "../../lib/hours";
import { copy } from "../../lib/i18n";
import type { Account, Employee, JobEntry, Language, Service, Session } from "../../lib/types";
import { createCrewDraft, type Draft } from "./drafts";
import { AccountFields, ServiceFields, TimeFields } from "./EntryFields";
import { accountLabel, buildLine } from "./helpers";
import { HeaderLine } from "./ui";

export function CrewEntry({ accounts, employees, services, language, session, onSubmit }: { accounts: Account[]; employees: Employee[]; services: Service[]; language: Language; session: Session; onSubmit: (entry: JobEntry) => void }) {
  const [draft, setDraft] = useState<Draft>(() => createCrewDraft());
  const [workerIds, setWorkerIds] = useState<string[]>([]);
  const [workerHours, setWorkerHours] = useState<Record<string, string>>({});
  const [workerPickerId, setWorkerPickerId] = useState("");
  const [step, setStep] = useState(1);
  const [feedback, setFeedback] = useState<string | null>(null);
  const calculated = calculateHours(draft.startTime, draft.finishTime);
  const t = copy[language];
  const crewWorkers = employees.filter((item) => item.active && item.role !== "admin");
  const availableWorkers = crewWorkers.filter((employee) => !workerIds.includes(employee.id));

  function updateDraft(partial: Partial<Draft>) {
    setFeedback(null);
    setDraft({ ...draft, ...partial });
  }

  function addWorker() {
    const nextWorkerId = workerPickerId || availableWorkers[0]?.id;
    if (!nextWorkerId) return;
    setWorkerIds((current) => current.includes(nextWorkerId) ? current : [...current, nextWorkerId]);
    setWorkerPickerId("");
    setFeedback(null);
  }

  function removeWorker(id: string) {
    setWorkerIds((current) => current.filter((item) => item !== id));
    setWorkerHours((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
    setFeedback(null);
  }

  function updateWorkerHours(id: string, hours: string) {
    setWorkerHours((current) => ({ ...current, [id]: hours }));
    setFeedback(null);
  }

  function nextStep() {
    const selectedOtherAccount = draft.accountId === "other";
    const hasAccount = draft.accountId && (!selectedOtherAccount || draft.rawAccountText.trim().length > 0);
    const hasService = draft.serviceIds.filter(Boolean).length > 0 || draft.rawServiceText.trim().length > 0;
    if (step === 1 && !hasAccount) {
      setFeedback(t.missingAccount);
      return;
    }
    if (step === 2 && (!Number.isFinite(calculated) || calculated <= 0)) {
      setFeedback(t.invalidHours);
      return;
    }
    if (step === 2 && draft.overrideHours && !draft.overrideReason.trim()) {
      setFeedback(t.missingReason);
      return;
    }
    if (step === 3 && !hasService) {
      setFeedback(t.missingService);
      return;
    }
    setFeedback(null);
    setStep(step + 1);
  }

  function submit() {
    const selectedOtherAccount = draft.accountId === "other";
    const hasAccount = draft.accountId && (!selectedOtherAccount || draft.rawAccountText.trim().length > 0);
    const hasService = draft.serviceIds.filter(Boolean).length > 0 || draft.rawServiceText.trim().length > 0;
    const approved = draft.overrideHours ? roundApprovedHours(Number(draft.overrideHours)) : calculated;
    if (!hasAccount) {
      setFeedback(t.missingAccount);
      setStep(1);
      return;
    }
    if (!Number.isFinite(approved) || approved <= 0) {
      setFeedback(t.invalidHours);
      setStep(2);
      return;
    }
    if (draft.overrideHours && !draft.overrideReason.trim()) {
      setFeedback(t.missingReason);
      setStep(2);
      return;
    }
    if (!hasService) {
      setFeedback(t.missingService);
      setStep(3);
      return;
    }
    if (workerIds.length === 0) {
      setFeedback(t.missingWorkers);
      setStep(4);
      return;
    }
    const hasInvalidWorkerHours = workerIds.some((id) => {
      const hours = workerHours[id];
      return hours && (!Number.isFinite(Number(hours)) || Number(hours) <= 0);
    });
    if (hasInvalidWorkerHours) {
      setFeedback(t.invalidWorkerHours);
      setStep(4);
      return;
    }
    const hasWorkerOverrides = workerIds.some((id) => Boolean(workerHours[id]));
    const flags = flagEntry({
      rawAccountText: selectedOtherAccount ? draft.rawAccountText : undefined,
      rawServiceText: draft.rawServiceText || undefined,
      workDate: draft.workDate,
      manualOverride: Boolean(draft.overrideHours) || hasWorkerOverrides,
      hours: approved
    });
    onSubmit({
      id: crypto.randomUUID(),
      submittedByEmployeeId: session.employeeId,
      accountId: selectedOtherAccount ? undefined : draft.accountId,
      rawAccountText: selectedOtherAccount ? draft.rawAccountText : undefined,
      workDate: draft.workDate,
      defaultStartTime: draft.startTime,
      defaultFinishTime: draft.finishTime,
      defaultCalculatedHours: calculated,
      serviceIds: draft.serviceIds.filter(Boolean),
      rawServiceText: draft.rawServiceText || undefined,
      notes: draft.notes,
      status: flags.length ? "flagged" : "approved",
      flags,
      workerLines: workerIds.map((id) => {
        const workerApproved = workerHours[id] ? roundApprovedHours(Number(workerHours[id])) : approved;
        return buildLine(id, draft.startTime, draft.finishTime, workerApproved, Boolean(draft.overrideHours) || Boolean(workerHours[id]), workerHours[id] ? "Crew worker hour override" : draft.overrideReason);
      }),
      createdAt: new Date().toISOString()
    });
    setDraft(createCrewDraft());
    setWorkerIds([]);
    setWorkerHours({});
    setWorkerPickerId("");
    setFeedback(null);
    setStep(1);
  }

  return (
    <section className="panel grid">
      <HeaderLine title={t.crew} subtitle={`${t.crewStep} ${step} / 4`} right={<span className="badge">{workerIds.length} {t.workers}</span>} />
      {feedback && (
        <div className="feedback-banner error" role="status" aria-live="polite">
          <AlertTriangle size={18} />
          <span>{feedback}</span>
        </div>
      )}
      {step === 1 && <AccountFields accounts={accounts} draft={draft} update={updateDraft} language={language} />}
      {step === 2 && <TimeFields draft={draft} update={updateDraft} calculated={calculated} language={language} />}
      {step === 3 && <ServiceFields services={services} draft={draft} update={updateDraft} language={language} />}
      {step === 4 && (
        <div className="grid">
          <div className="worker-picker">
            <select className="select" value={workerPickerId} onChange={(event) => setWorkerPickerId(event.target.value)} aria-label={t.selectWorker}>
              <option value="">{availableWorkers.length ? t.selectWorker : t.allWorkersAdded}</option>
              {availableWorkers.map((employee) => <option key={employee.id} value={employee.id}>{employee.name}</option>)}
            </select>
            <button className="primary" onClick={addWorker} disabled={availableWorkers.length === 0}>
              <Plus size={18} /> {t.addWorker}
            </button>
          </div>
          <div className="list">
            {workerIds.map((workerId, index) => {
              const employee = crewWorkers.find((item) => item.id === workerId);
              return (
                <div className="row worker-row" key={workerId}>
                  <div>
                    <strong>{index + 1}. {employee?.name ?? workerId}</strong>
                    <div className="small muted">{draft.startTime || "--:--"} - {draft.finishTime || "--:--"} / {workerHours[workerId] || calculated.toFixed(1)} {t.hoursEach}</div>
                  </div>
                  <div className="worker-hours">
                    <label className="small muted" htmlFor={`worker-hours-${workerId}`}>{t.hours}</label>
                    <input
                      id={`worker-hours-${workerId}`}
                      className="input"
                      inputMode="decimal"
                      value={workerHours[workerId] ?? ""}
                      onChange={(event) => updateWorkerHours(workerId, event.target.value)}
                      onBlur={(event) => {
                        const rounded = roundApprovedHours(Number(event.target.value));
                        if (Number.isFinite(rounded) && rounded > 0) updateWorkerHours(workerId, String(rounded));
                      }}
                      placeholder={`${calculated.toFixed(1)} ${t.hoursLower}`}
                      aria-label={`${employee?.name ?? workerId} ${t.hours}`}
                    />
                  </div>
                  <button className="danger" onClick={() => removeWorker(workerId)} aria-label={`${t.removeWorker} ${employee?.name ?? workerId}`}>
                    <Trash2 size={18} /> {t.remove}
                  </button>
                </div>
              );
            })}
            {workerIds.length === 0 && <p className="muted">{t.noWorkersSelected}</p>}
          </div>
          <div className="field">
            <label>{t.notes}</label>
            <textarea className="textarea" value={draft.notes} onChange={(event) => updateDraft({ notes: event.target.value })} />
          </div>
          <div className="card list">
            <strong>{t.review}</strong>
            <span>{accountLabel(accounts, draft.accountId, draft.rawAccountText)} / {draft.workDate}</span>
            <span>{draft.startTime} - {draft.finishTime} / {calculated} {t.hoursEach}</span>
            <span>{t.defaultPm}</span>
            <span>{workerIds.length} {t.workers}</span>
          </div>
        </div>
      )}
      <div className="footer-actions">
        <button className="secondary" onClick={() => setStep(Math.max(1, step - 1))}>{t.back}</button>
        {step < 4 ? <button className="primary" onClick={nextStep}>{t.next}</button> : <button className="primary" onClick={submit}>{t.submitCrew}</button>}
      </div>
    </section>
  );
}
