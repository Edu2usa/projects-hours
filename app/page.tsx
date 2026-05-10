"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CalendarRange,
  Check,
  Download,
  FileSpreadsheet,
  Languages,
  LogOut,
  MapPin,
  Plus,
  Search,
  Send,
  ShieldCheck,
  Users
} from "lucide-react";
import { accounts, demoEntries, employees, services } from "../lib/demo-data";
import { calculateHours, flagEntry } from "../lib/hours";
import { copy, languages } from "../lib/i18n";
import { clearDraft, clearSession, loadDraft, loadEntries, loadSession, saveDraft, saveEntries, saveSession } from "../lib/storage";
import type { JobEntry, Language, Session, WorkerLine } from "../lib/types";

type Screen = "quick" | "crew" | "recent" | "admin";

const today = new Date().toISOString().slice(0, 10);

type Draft = {
  accountId: string;
  rawAccountText: string;
  workDate: string;
  startTime: string;
  finishTime: string;
  serviceIds: string[];
  rawServiceText: string;
  overrideHours: string;
  overrideReason: string;
  notes: string;
};

const emptyDraft: Draft = {
  accountId: accounts[0]?.id ?? "",
  rawAccountText: "",
  workDate: today,
  startTime: "17:00",
  finishTime: "01:00",
  serviceIds: [services[0]?.id ?? ""],
  rawServiceText: "",
  overrideHours: "",
  overrideReason: "",
  notes: ""
};

export default function Home() {
  const [session, setSession] = useState<Session | null>(null);
  const [language, setLanguage] = useState<Language>("en");
  const [screen, setScreen] = useState<Screen>("quick");
  const [entries, setEntries] = useState<JobEntry[]>(demoEntries);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [online, setOnline] = useState(true);

  useEffect(() => {
    setEntries(loadEntries(demoEntries));
    const savedSession = loadSession();
    const savedDraft = loadDraft<Draft>();
    if (savedSession) {
      setSession(savedSession);
      setLanguage(savedSession.language);
      setScreen(savedSession.admin ? "admin" : "quick");
    }
    if (savedDraft) setDraft(savedDraft);
    setOnline(navigator.onLine);
    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  const t = copy[language];
  const currentEmployee = employees.find((employee) => employee.id === session?.employeeId);
  const employeeEntries = entries.filter((entry) => entry.workerLines.some((line) => line.employeeId === session?.employeeId));
  const flaggedEntries = entries.filter((entry) => entry.flags.length || entry.status !== "approved");
  const totals = useMemo(() => summarize(entries), [entries]);

  function cycleLanguage() {
    const current = languages.findIndex((item) => item.code === language);
    const next = languages[(current + 1) % languages.length].code;
    setLanguage(next);
    if (session) {
      const nextSession = { ...session, language: next };
      setSession(nextSession);
      saveSession(nextSession);
    }
  }

  function signOut() {
    clearSession();
    setSession(null);
    setScreen("quick");
  }

  function persistEntry(entry: JobEntry) {
    const next = [entry, ...entries];
    setEntries(next);
    saveEntries(next);
    clearDraft();
    setDraft(emptyDraft);
  }

  if (!session) {
    return (
      <Shell language={language} onLanguage={cycleLanguage}>
        <Login language={language} onLogin={(next) => {
          setSession(next);
          setLanguage(next.language);
          saveSession(next);
          setScreen(next.admin ? "admin" : "quick");
        }} />
      </Shell>
    );
  }

  return (
    <Shell
      language={language}
      onLanguage={cycleLanguage}
      right={
        <>
          <span className={`badge ${online ? "" : "warn"}`}>{online ? "Online" : "Offline draft"}</span>
          <button className="icon-button" onClick={signOut} aria-label="Sign out" title="Sign out">
            <LogOut size={18} />
          </button>
        </>
      }
    >
      <main className="main grid">
        <section className="tabs">
          <button className={`tab ${screen === "quick" ? "active" : ""}`} onClick={() => setScreen("quick")}>
            <Send size={18} /> {t.quick}
          </button>
          {currentEmployee?.role !== "worker" && (
            <button className={`tab ${screen === "crew" ? "active" : ""}`} onClick={() => setScreen("crew")}>
              <Users size={18} /> {t.crew}
            </button>
          )}
          <button className={`tab ${screen === "recent" ? "active" : ""}`} onClick={() => setScreen("recent")}>
            <CalendarRange size={18} /> {t.recent}
          </button>
          {currentEmployee?.role === "admin" && (
            <button className={`tab ${screen === "admin" ? "active" : ""}`} onClick={() => setScreen("admin")}>
              <ShieldCheck size={18} /> {t.admin}
            </button>
          )}
        </section>

        {screen === "quick" && (
          <QuickEntry
            draft={draft}
            setDraft={setDraft}
            language={language}
            session={session}
            onSaveDraft={() => saveDraft(draft)}
            onSubmit={(entry) => persistEntry(entry)}
          />
        )}
        {screen === "crew" && (
          <CrewEntry language={language} session={session} onSubmit={(entry) => persistEntry(entry)} />
        )}
        {screen === "recent" && (
          <RecentEntries entries={employeeEntries} language={language} employeeId={session.employeeId} />
        )}
        {screen === "admin" && currentEmployee?.role === "admin" && (
          <AdminDashboard entries={entries} setEntries={(next) => { setEntries(next); saveEntries(next); }} totals={totals} flaggedEntries={flaggedEntries} />
        )}
      </main>
    </Shell>
  );
}

function Shell({ children, language, onLanguage, right }: { children: React.ReactNode; language: Language; onLanguage: () => void; right?: React.ReactNode }) {
  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">PM</div>
          <div>
            <h1>Special Project Hours</h1>
            <span>Preferred Maintenance</span>
          </div>
        </div>
        <div className="segmented">
          <button className="icon-button" onClick={onLanguage} aria-label="Change language" title={`Language: ${language.toUpperCase()}`}>
            <Languages size={18} />
          </button>
          {right}
        </div>
      </header>
      {children}
    </div>
  );
}

function Login({ language, onLogin }: { language: Language; onLogin: (session: Session) => void }) {
  const t = copy[language];
  const [employeeId, setEmployeeId] = useState(employees[0].id);
  const [pin, setPin] = useState("");
  const [adminMode, setAdminMode] = useState(false);
  const employee = employees.find((item) => item.id === employeeId) ?? employees[0];

  function submit() {
    if (adminMode) {
      onLogin({ employeeId: "ed", role: "admin", language, admin: true });
      return;
    }
    onLogin({ employeeId, role: employee.role, language: employee.preferredLanguage ?? language, admin: employee.role === "admin" });
  }

  return (
    <main className="main login">
      <section className="panel grid">
        <div>
          <h2 className="section-title">{t.loginTitle}</h2>
          <p className="muted">{t.loginSubtitle}</p>
        </div>
        <div className="field">
          <label>{t.employee}</label>
          <select className="select" value={employeeId} onChange={(event) => setEmployeeId(event.target.value)} disabled={adminMode}>
            {employees.filter((item) => item.active).map((item) => (
              <option key={item.id} value={item.id}>{item.name}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>{adminMode ? "Admin PIN" : t.pin}</label>
          <input className="input" value={pin} onChange={(event) => setPin(event.target.value)} inputMode="numeric" maxLength={adminMode ? 12 : 4} type="password" />
        </div>
        <div className="segmented">
          <button className={`chip ${!adminMode ? "active" : ""}`} onClick={() => setAdminMode(false)}>Employee</button>
          <button className={`chip ${adminMode ? "active" : ""}`} onClick={() => setAdminMode(true)}>Admin</button>
        </div>
        <button className="primary" onClick={submit}>{t.signIn}</button>
        <p className="small muted">PINs are validated server-side after Supabase is connected. This preview stores a local session only.</p>
      </section>
    </main>
  );
}

function QuickEntry({ draft, setDraft, language, session, onSaveDraft, onSubmit }: {
  draft: Draft;
  setDraft: (draft: Draft) => void;
  language: Language;
  session: Session;
  onSaveDraft: () => void;
  onSubmit: (entry: JobEntry) => void;
}) {
  const t = copy[language];
  const calculated = calculateHours(draft.startTime, draft.finishTime);
  const approved = draft.overrideHours ? Number(draft.overrideHours) : calculated;
  const selectedOtherAccount = draft.accountId === "other";
  const flags = flagEntry({
    rawAccountText: selectedOtherAccount ? draft.rawAccountText : undefined,
    rawServiceText: draft.rawServiceText || undefined,
    workDate: draft.workDate,
    manualOverride: Boolean(draft.overrideHours),
    hours: approved
  });

  function update(partial: Partial<Draft>) {
    setDraft({ ...draft, ...partial });
  }

  function submit() {
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
      <HeaderLine title={t.quick} subtitle="Clean one-worker submission" right={<span className={`badge ${flags.length ? "warn" : ""}`}>{flags.length ? `${flags.length} flags` : "Clean"}</span>} />
      <AccountFields draft={draft} update={update} language={language} />
      <TimeFields draft={draft} update={update} calculated={calculated} language={language} />
      <ServiceFields draft={draft} update={update} language={language} />
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
        <button className="secondary" onClick={onSaveDraft}>{t.saveDraft}</button>
        <button className="primary" onClick={submit} disabled={Boolean(draft.overrideHours && !draft.overrideReason)}>{t.submit}</button>
      </div>
    </section>
  );
}

function CrewEntry({ language, session, onSubmit }: { language: Language; session: Session; onSubmit: (entry: JobEntry) => void }) {
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [workerIds, setWorkerIds] = useState<string[]>(["ramon", "maria"]);
  const [step, setStep] = useState(1);
  const calculated = calculateHours(draft.startTime, draft.finishTime);
  const t = copy[language];

  function toggleWorker(id: string) {
    setWorkerIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  function submit() {
    const flags = flagEntry({
      rawAccountText: draft.accountId === "other" ? draft.rawAccountText : undefined,
      rawServiceText: draft.rawServiceText || undefined,
      workDate: draft.workDate,
      manualOverride: Boolean(draft.overrideHours),
      hours: draft.overrideHours ? Number(draft.overrideHours) : calculated
    });
    onSubmit({
      id: crypto.randomUUID(),
      submittedByEmployeeId: session.employeeId,
      accountId: draft.accountId === "other" ? undefined : draft.accountId,
      rawAccountText: draft.accountId === "other" ? draft.rawAccountText : undefined,
      workDate: draft.workDate,
      defaultStartTime: draft.startTime,
      defaultFinishTime: draft.finishTime,
      defaultCalculatedHours: calculated,
      serviceIds: draft.serviceIds,
      rawServiceText: draft.rawServiceText || undefined,
      notes: draft.notes,
      status: flags.length ? "flagged" : "approved",
      flags,
      workerLines: workerIds.map((id) => buildLine(id, draft.startTime, draft.finishTime, draft.overrideHours ? Number(draft.overrideHours) : calculated, Boolean(draft.overrideHours), draft.overrideReason)),
      createdAt: new Date().toISOString()
    });
  }

  return (
    <section className="panel grid">
      <HeaderLine title={t.crew} subtitle={`Step ${step} of 4`} right={<span className="badge">{workerIds.length} workers</span>} />
      {step === 1 && <AccountFields draft={draft} update={(partial) => setDraft({ ...draft, ...partial })} language={language} />}
      {step === 2 && <TimeFields draft={draft} update={(partial) => setDraft({ ...draft, ...partial })} calculated={calculated} language={language} />}
      {step === 3 && <ServiceFields draft={draft} update={(partial) => setDraft({ ...draft, ...partial })} language={language} />}
      {step === 4 && (
        <div className="grid">
          <div className="grid two">
            {employees.filter((item) => item.role !== "admin").map((employee) => (
              <button key={employee.id} className={`chip ${workerIds.includes(employee.id) ? "active" : ""}`} onClick={() => toggleWorker(employee.id)}>
                {workerIds.includes(employee.id) && <Check size={16} />} {employee.name}
              </button>
            ))}
          </div>
          <div className="field">
            <label>{t.notes}</label>
            <textarea className="textarea" value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} />
          </div>
          <div className="card list">
            <strong>Review</strong>
            <span>{accountLabel(draft.accountId, draft.rawAccountText)} / {draft.workDate}</span>
            <span>{draft.startTime} - {draft.finishTime} / {calculated} hours each</span>
          </div>
        </div>
      )}
      <div className="footer-actions">
        <button className="secondary" onClick={() => setStep(Math.max(1, step - 1))}>Back</button>
        {step < 4 ? <button className="primary" onClick={() => setStep(step + 1)}>Next</button> : <button className="primary" onClick={submit}>Submit crew job</button>}
      </div>
    </section>
  );
}

function AccountFields({ draft, update, language }: { draft: Draft; update: (partial: Partial<Draft>) => void; language: Language }) {
  const t = copy[language];
  return (
    <div className="grid">
      <div className="field">
        <label>{t.account}</label>
        <select className="select" value={draft.accountId} onChange={(event) => update({ accountId: event.target.value })}>
          {accounts.filter((account) => account.isFavorite).map((account) => <option key={account.id} value={account.id}>★ {account.canonicalName}</option>)}
          {accounts.filter((account) => !account.isFavorite).map((account) => <option key={account.id} value={account.id}>{account.canonicalName}</option>)}
          <option value="other">Other / cleanup needed</option>
        </select>
      </div>
      {draft.accountId === "other" && (
        <div className="field">
          <label>{t.otherAccount}</label>
          <input className="input" value={draft.rawAccountText} onChange={(event) => update({ rawAccountText: event.target.value })} />
        </div>
      )}
    </div>
  );
}

function TimeFields({ draft, update, calculated, language }: { draft: Draft; update: (partial: Partial<Draft>) => void; calculated: number; language: Language }) {
  const t = copy[language];
  return (
    <div className="grid two">
      <div className="field">
        <label>{t.workDate}</label>
        <input className="input" type="date" value={draft.workDate} onChange={(event) => update({ workDate: event.target.value })} />
      </div>
      <div className="field">
        <label>{t.hours}</label>
        <input className="input" value={`${draft.overrideHours || calculated} hours`} readOnly />
      </div>
      <div className="field">
        <label>{t.start}</label>
        <input className="input" type="time" value={draft.startTime} onChange={(event) => update({ startTime: event.target.value })} />
      </div>
      <div className="field">
        <label>{t.finish}</label>
        <input className="input" type="time" value={draft.finishTime} onChange={(event) => update({ finishTime: event.target.value })} />
      </div>
      <div className="field">
        <label>{t.override}</label>
        <input className="input" inputMode="decimal" value={draft.overrideHours} onChange={(event) => update({ overrideHours: event.target.value })} placeholder="Optional" />
      </div>
      <div className="field">
        <label>{t.reason}</label>
        <input className="input" value={draft.overrideReason} onChange={(event) => update({ overrideReason: event.target.value })} disabled={!draft.overrideHours} />
      </div>
    </div>
  );
}

function ServiceFields({ draft, update, language }: { draft: Draft; update: (partial: Partial<Draft>) => void; language: Language }) {
  const t = copy[language];
  function toggleService(id: string) {
    update({ serviceIds: draft.serviceIds.includes(id) ? draft.serviceIds.filter((item) => item !== id) : [...draft.serviceIds, id] });
  }
  return (
    <div className="grid">
      <label className="muted small">{t.service}</label>
      <div className="segmented">
        {services.map((service) => (
          <button key={service.id} className={`chip ${draft.serviceIds.includes(service.id) ? "active" : ""}`} onClick={() => toggleService(service.id)}>
            {service.isCommon ? <Plus size={16} /> : <Search size={16} />} {service.label[language]}
          </button>
        ))}
      </div>
      <div className="field">
        <label>{t.otherService}</label>
        <input className="input" value={draft.rawServiceText} onChange={(event) => update({ rawServiceText: event.target.value })} placeholder="Optional" />
      </div>
    </div>
  );
}

function RecentEntries({ entries, language, employeeId }: { entries: JobEntry[]; language: Language; employeeId: string }) {
  return (
    <section className="panel grid">
      <HeaderLine title={copy[language].recent} subtitle="Own submissions and correction requests" />
      <div className="list">
        {entries.map((entry) => {
          const line = entry.workerLines.find((item) => item.employeeId === employeeId);
          return (
            <div className="row" key={entry.id}>
              <div>
                <strong>{accountLabel(entry.accountId, entry.rawAccountText)}</strong>
                <div className="small muted">{entry.workDate} / {line?.approvedHours ?? entry.defaultCalculatedHours} hours</div>
              </div>
              <span className={`badge ${entry.flags.length ? "warn" : ""}`}>{entry.flags.length ? "Needs review" : "Approved"}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function AdminDashboard({ entries, setEntries, totals, flaggedEntries }: { entries: JobEntry[]; setEntries: (entries: JobEntry[]) => void; totals: ReturnType<typeof summarize>; flaggedEntries: JobEntry[] }) {
  function resolve(entryId: string) {
    setEntries(entries.map((entry) => entry.id === entryId ? { ...entry, status: "approved", flags: [] } : entry));
  }

  return (
    <section className="grid">
      <div className="grid three">
        <Stat label="Pending flags" value={flaggedEntries.length} />
        <Stat label="Period hours" value={totals.totalHours.toFixed(1)} />
        <Stat label="Employees" value={totals.byEmployee.length} />
      </div>
      <div className="panel grid">
        <HeaderLine
          title="Payroll close"
          subtitle="Resolve flags, classify REG/OT/DT, then export."
          right={
            <div className="segmented">
              <a className="secondary" href="/api/export/excel"><FileSpreadsheet size={18} /> Excel</a>
              <a className="secondary" href="/api/export/pdf"><Download size={18} /> PDF</a>
            </div>
          }
        />
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
                <strong>{accountLabel(entry.accountId, entry.rawAccountText)}</strong>
                <div className="small muted">{entry.workDate} / {entry.flags.join(", ")}</div>
              </div>
              <button className="secondary" onClick={() => resolve(entry.id)}>Resolve</button>
            </div>
          ))}
          {flaggedEntries.length === 0 && <p className="muted">No pending flags.</p>}
        </div>
      </div>
      <div className="panel grid">
        <HeaderLine title="Master data" subtitle="Seeded employees, accounts/sites, and services" />
        <div className="grid three">
          <ReportList title="Employees" rows={employees.map((employee) => ({ label: employee.name, value: employee.role }))} />
          <ReportList title="Accounts" rows={accounts.map((account) => ({ label: account.canonicalName, value: account.isFavorite ? "Favorite" : "Active" }))} />
          <ReportList title="Services" rows={services.map((service) => ({ label: service.label.en, value: service.isCommon ? "Common" : "Full list" }))} />
        </div>
      </div>
    </section>
  );
}

function HeaderLine({ title, subtitle, right }: { title: string; subtitle?: string; right?: React.ReactNode }) {
  return (
    <div className="row">
      <div>
        <h2 className="section-title">{title}</h2>
        {subtitle && <div className="muted small">{subtitle}</div>}
      </div>
      {right}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="card stat">
      <span className="muted small">{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function ReportList({ title, rows }: { title: string; rows: { label: string; value: string | number }[] }) {
  return (
    <div className="card list">
      <strong>{title}</strong>
      {rows.map((row) => (
        <div className="row" key={`${title}-${row.label}`}>
          <span>{row.label}</span>
          <span className="badge">{row.value}</span>
        </div>
      ))}
    </div>
  );
}

function buildLine(employeeId: string, startTime: string, finishTime: string, approvedHours: number, manualOverride: boolean, overrideReason: string): WorkerLine {
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

function accountLabel(accountId?: string, raw?: string) {
  if (raw) return raw;
  return accounts.find((account) => account.id === accountId)?.canonicalName ?? "Unknown account";
}

function summarize(entries: JobEntry[]) {
  const byEmployee = new Map<string, number>();
  const byAccount = new Map<string, number>();
  const byService = new Map<string, number>();
  let totalHours = 0;

  for (const entry of entries) {
    const entryHours = entry.workerLines.reduce((sum, line) => sum + line.approvedHours, 0);
    totalHours += entryHours;
    byAccount.set(accountLabel(entry.accountId, entry.rawAccountText), (byAccount.get(accountLabel(entry.accountId, entry.rawAccountText)) ?? 0) + entryHours);
    for (const serviceId of entry.serviceIds) {
      const name = services.find((service) => service.id === serviceId)?.label.en ?? serviceId;
      byService.set(name, (byService.get(name) ?? 0) + entryHours);
    }
    for (const line of entry.workerLines) {
      const name = employees.find((employee) => employee.id === line.employeeId)?.name ?? line.employeeId;
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
