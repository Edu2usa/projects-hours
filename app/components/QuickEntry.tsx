"use client";

import { useState } from "react";
import { AlertTriangle, Check } from "lucide-react";
import { calculateHours, flagEntry, roundApprovedHours } from "../../lib/hours";
import { copy } from "../../lib/i18n";
import type { Account, JobEntry, Language, Service, Session } from "../../lib/types";
import type { Draft } from "./drafts";
import { AccountFields, ServiceFields, TimeFields } from "./EntryFields";
import { buildLine } from "./helpers";
import { HeaderLine } from "./ui";

export function QuickEntry({ accounts, services, draft, setDraft, language, session, onSaveDraft, onSubmit }: {
  accounts: Account[];
  services: Service[];
  draft: Draft;
  setDraft: (draft: Draft) => void;
  language: Language;
  session: Session;
  onSaveDraft: () => void;
  onSubmit: (entry: JobEntry) => void;
}) {
  const t = copy[language];
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const calculated = calculateHours(draft.startTime, draft.finishTime);
  const approved = draft.overrideHours ? roundApprovedHours(Number(draft.overrideHours)) : calculated;
  const selectedOtherAccount = draft.accountId === "other";
  const flags = flagEntry({
    rawAccountText: selectedOtherAccount ? draft.rawAccountText : undefined,
    rawServiceText: draft.rawServiceText || undefined,
    workDate: draft.workDate,
    manualOverride: Boolean(draft.overrideHours),
    hours: approved
  });

  function update(partial: Partial<Draft>) {
    if (feedback) setFeedback(null);
    setDraft({ ...draft, ...partial });
  }

  function saveCurrentDraft() {
    onSaveDraft();
    setFeedback({ type: "success", text: navigator.onLine ? t.draftSaved : t.offlineDraftSaved });
  }

  function submit() {
    const hasAccount = draft.accountId && (!selectedOtherAccount || draft.rawAccountText.trim().length > 0);
    const hasService = draft.serviceIds.filter(Boolean).length > 0 || draft.rawServiceText.trim().length > 0;
    if (!hasAccount) {
      setFeedback({ type: "error", text: t.missingAccount });
      return;
    }
    if (!hasService) {
      setFeedback({ type: "error", text: t.missingService });
      return;
    }
    if (!Number.isFinite(approved) || approved <= 0) {
      setFeedback({ type: "error", text: t.invalidHours });
      return;
    }
    if (draft.overrideHours && !draft.overrideReason.trim()) {
      setFeedback({ type: "error", text: t.missingReason });
      return;
    }
    const workerLine = buildLine(session.employeeId, draft.startTime, draft.finishTime, approved, Boolean(draft.overrideHours), draft.overrideReason);
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
      workerLines: [workerLine],
      createdAt: new Date().toISOString()
    });
  }

  return (
    <section className="panel grid">
      <HeaderLine title={t.quick} subtitle={t.quickSubtitle} right={<span className={`badge ${flags.length ? "warn" : ""}`}>{flags.length ? `${flags.length} ${t.flags.toLowerCase()}` : t.clean}</span>} />
      {feedback && (
        <div className={`feedback-banner ${feedback.type}`} role="status" aria-live="polite">
          {feedback.type === "success" ? <Check size={18} /> : <AlertTriangle size={18} />}
          <span>{feedback.text}</span>
        </div>
      )}
      <AccountFields accounts={accounts} draft={draft} update={update} language={language} />
      <TimeFields draft={draft} update={update} calculated={calculated} language={language} />
      <ServiceFields services={services} draft={draft} update={update} language={language} />
      <div className="field">
        <label>{t.notes}</label>
        <textarea className="textarea" value={draft.notes} onChange={(event) => update({ notes: event.target.value })} />
      </div>
      {flags.length > 0 && (
        <div className="card list">
          {flags.map((flag) => <span key={flag} className="badge warn"><AlertTriangle size={14} /> {flag}</span>)}
        </div>
      )}
      <div className="footer-actions">
        <button className="secondary" onClick={saveCurrentDraft}>{t.saveDraft}</button>
        <button className="primary" onClick={submit}>{t.submit}</button>
      </div>
    </section>
  );
}
