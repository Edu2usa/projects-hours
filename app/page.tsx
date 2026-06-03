"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CalendarRange,
  Check,
  Download,
  FileSpreadsheet,
  FileText,
  Languages,
  LogOut,
  Plus,
  Search,
  Send,
  ShieldCheck,
  Trash2,
  Users
} from "lucide-react";
import { accounts as seedAccounts, demoEntries, employees as seedEmployees, services as seedServices } from "../lib/demo-data";
import { calculateHours, flagEntry, roundApprovedHours } from "../lib/hours";
import { copy, languages } from "../lib/i18n";
import { clearDraft, clearSession, loadAccounts, loadDraft, loadEmployees, loadEntries, loadServices, loadSession, saveAccounts, saveDraft, saveEmployees, saveEntries, saveServices, saveSession } from "../lib/storage";
import { loadRemoteAppState, saveRemoteAppState, saveRemoteEntry } from "../lib/app-state";
import type { Account, Employee, JobEntry, Language, Role, Service, Session, WorkerLine } from "../lib/types";

type Screen = "quick" | "crew" | "recent" | "admin";

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

type AdminEditDraft = {
  accountId: string;
  rawAccountText: string;
  workDate: string;
  defaultStartTime: string;
  defaultFinishTime: string;
  serviceIds: string[];
  rawServiceText: string;
  notes: string;
  workerLines: Array<{
    id: string;
    employeeId: string;
    startTime: string;
    finishTime: string;
    approvedHours: string;
    overrideReason: string;
  }>;
};

function createEmptyDraft(): Draft {
  return createDraft();
}

function createCrewDraft(): Draft {
  return createDraft({ startTime: "17:00", finishTime: "21:00" });
}

function createDraft(defaults: Partial<Draft> = {}): Draft {
  return {
    accountId: "",
    rawAccountText: "",
    workDate: new Date().toISOString().slice(0, 10),
    startTime: "",
    finishTime: "",
    serviceIds: [],
    rawServiceText: "",
    overrideHours: "",
    overrideReason: "",
    notes: "",
    ...defaults
  };
}

export default function Home() {
  const [session, setSession] = useState<Session | null>(null);
  const [language, setLanguage] = useState<Language>("en");
  const [screen, setScreen] = useState<Screen>("quick");
  const [entries, setEntries] = useState<JobEntry[]>(demoEntries);
  const [accountList, setAccountList] = useState<Account[]>(seedAccounts);
  const [employeeList, setEmployeeList] = useState<Employee[]>(seedEmployees);
  const [serviceList, setServiceList] = useState<Service[]>(seedServices);
  const [draft, setDraft] = useState<Draft>(() => createEmptyDraft());
  const [submitNotice, setSubmitNotice] = useState<string | null>(null);
  const [adminSaveNotice, setAdminSaveNotice] = useState<string | null>(null);
  const [online, setOnline] = useState(true);

  useEffect(() => {
    setEntries(loadEntries(demoEntries));
    setAccountList(loadAccounts(seedAccounts));
    setEmployeeList(loadEmployees(seedEmployees));
    setServiceList(loadServices(seedServices));
    const savedSession = loadSession();
    const savedDraft = loadDraft<Draft>();
    if (savedSession?.token) {
      setSession(savedSession);
      setLanguage(savedSession.language);
      setScreen(savedSession.admin ? "admin" : "quick");
    } else if (savedSession) {
      clearSession();
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
  const currentEmployee = employeeList.find((employee) => employee.id === session?.employeeId);
  const employeeEntries = entries.filter((entry) => entry.workerLines.some((line) => line.employeeId === session?.employeeId));
  const flaggedEntries = entries.filter((entry) => entry.flags.length || entry.status !== "approved" || entry.rawAccountText || entry.rawServiceText);
  const totals = useMemo(() => summarize(entries, accountList, employeeList, serviceList), [entries, accountList, employeeList, serviceList]);

  useEffect(() => {
    let mounted = true;
    loadRemoteAppState()
      .then((remoteState) => {
        if (!mounted || !remoteState) return;
        applyRemoteState(remoteState);
      })
      .catch(() => undefined);
    return () => {
      mounted = false;
    };
  }, []);

  function applyRemoteState(remoteState: { accounts: Account[]; employees: Employee[]; services: Service[]; entries: JobEntry[] }) {
    setAccountList(remoteState.accounts);
    setEmployeeList(remoteState.employees);
    setServiceList(remoteState.services);
    setEntries(remoteState.entries);
    saveAccounts(remoteState.accounts);
    saveEmployees(remoteState.employees);
    saveServices(remoteState.services);
    saveEntries(remoteState.entries);
  }

  async function persistAppState(nextState: Partial<{ accounts: Account[]; employees: Employee[]; services: Service[]; entries: JobEntry[] }>) {
    const state = {
      version: 2,
      accounts: nextState.accounts ?? accountList,
      employees: nextState.employees ?? employeeList,
      services: nextState.services ?? serviceList,
      entries: nextState.entries ?? entries
    };
    const remoteState = await saveRemoteAppState(state, session?.token);
    if (remoteState) {
      applyRemoteState(remoteState);
      setAdminSaveNotice("Saved to server. Phones will see this after refresh.");
    } else {
      setAdminSaveNotice("Not saved to server. Log out/in as admin and try again.");
    }
  }

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

  async function persistEntry(entry: JobEntry) {
    const next = [entry, ...entries];
    setEntries(next);
    saveEntries(next);
    clearDraft();
    setDraft(createEmptyDraft());
    const totalHours = entry.workerLines.reduce((sum, line) => sum + line.approvedHours, 0);
    setSubmitNotice(`${accountLabel(accountList, entry.accountId, entry.rawAccountText)} / ${entry.workDate} / ${totalHours.toFixed(1)} ${t.hoursLower}`);
    const remoteState = await saveRemoteEntry(entry, session?.token);
    if (remoteState) {
      setEntries(remoteState.entries);
      saveEntries(remoteState.entries);
    }
  }

  if (!session) {
    return (
      <Shell language={language} onLanguage={cycleLanguage}>
        <Login employees={employeeList} language={language} onLogin={(next) => {
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
            accounts={accountList}
            services={serviceList}
            draft={draft}
            setDraft={setDraft}
            language={language}
            session={session}
            submitNotice={submitNotice}
            onEdit={() => setSubmitNotice(null)}
            onSaveDraft={() => saveDraft(draft)}
            onSubmit={(entry) => void persistEntry(entry)}
          />
        )}
        {screen === "crew" && (
          <CrewEntry accounts={accountList} employees={employeeList} services={serviceList} language={language} session={session} onSubmit={(entry) => void persistEntry(entry)} />
        )}
        {screen === "recent" && (
          <RecentEntries entries={employeeEntries} accounts={accountList} language={language} employeeId={session.employeeId} />
        )}
        {screen === "admin" && currentEmployee?.role === "admin" && (
          <AdminDashboard
            entries={entries}
            setEntries={(next) => { setEntries(next); saveEntries(next); persistAppState({ entries: next }); }}
            accounts={accountList}
            setAccounts={(next) => { setAccountList(next); saveAccounts(next); persistAppState({ accounts: next }); }}
            employees={employeeList}
            setEmployees={(next) => { setEmployeeList(next); saveEmployees(next); persistAppState({ employees: next }); }}
            services={serviceList}
            setServices={(next) => { setServiceList(next); saveServices(next); persistAppState({ services: next }); }}
            totals={totals}
            flaggedEntries={flaggedEntries}
            adminSaveNotice={adminSaveNotice}
            saveAdminState={async (nextState) => {
              const nextAccounts = nextState.accounts ?? accountList;
              const nextEmployees = nextState.employees ?? employeeList;
              const nextServices = nextState.services ?? serviceList;
              const nextEntries = nextState.entries ?? entries;
              if (nextState.accounts) {
                setAccountList(nextAccounts);
                saveAccounts(nextAccounts);
              }
              if (nextState.employees) {
                setEmployeeList(nextEmployees);
                saveEmployees(nextEmployees);
              }
              if (nextState.services) {
                setServiceList(nextServices);
                saveServices(nextServices);
              }
              if (nextState.entries) {
                setEntries(nextEntries);
                saveEntries(nextEntries);
              }
              const remoteState = await saveRemoteAppState({
                version: 2,
                accounts: nextAccounts,
                employees: nextEmployees,
                services: nextServices,
                entries: nextEntries
              }, session.token);
              if (remoteState) {
                applyRemoteState(remoteState);
                setAdminSaveNotice("Saved to server. Phones will see this after refresh.");
              } else {
                setAdminSaveNotice("Not saved to server. Log out/in as admin and try again.");
              }
            }}
          />
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
          <img className="brand-logo" src="/preferred-maintenance-logo.png" alt="Preferred Maintenance logo" />
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

function Login({ language, onLogin }: { employees: Employee[]; language: Language; onLogin: (session: Session) => void }) {
  const t = copy[language];
  const [username, setUsername] = useState("");
  const [pin, setPin] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    setFeedback(null);
    setSubmitting(true);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username, pin })
      });
      const payload = await response.json() as { ok?: boolean; session?: Session; error?: string };
      if (!response.ok || !payload.ok || !payload.session) {
        setFeedback(payload.error ?? t.invalidLogin);
        return;
      }
      onLogin(payload.session);
    } catch {
      setFeedback(t.loginError);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="main login">
      <section className="panel grid">
        <div>
          <h2 className="section-title">{t.loginTitle}</h2>
          <p className="muted">{t.loginSubtitle}</p>
        </div>
        <div className="field">
          <label>{t.user}</label>
          <input className="input" value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" />
        </div>
        <div className="field">
          <label>{t.pin}</label>
          <input className="input" value={pin} onChange={(event) => setPin(event.target.value)} inputMode="numeric" maxLength={4} type="password" autoComplete="current-password" />
        </div>
        {feedback && (
          <div className="feedback-banner error" role="status">
            <AlertTriangle size={18} />
            <span>{feedback}</span>
          </div>
        )}
        <button className="primary" onClick={submit} disabled={submitting}>{submitting ? t.signingIn : t.signIn}</button>
      </section>
    </main>
  );
}

function QuickEntry({ accounts, services, draft, setDraft, language, session, submitNotice, onEdit, onSaveDraft, onSubmit }: {
  accounts: Account[];
  services: Service[];
  draft: Draft;
  setDraft: (draft: Draft) => void;
  language: Language;
  session: Session;
  submitNotice: string | null;
  onEdit: () => void;
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
      {submitNotice && (
        <div className="success-banner" role="status" aria-live="polite">
          <Check size={20} />
          <div>
            <strong>{t.submitted}</strong>
            <span>{submitNotice}</span>
            <small>{t.readyNext}</small>
          </div>
        </div>
      )}
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

function CrewEntry({ accounts, employees, services, language, session, onSubmit }: { accounts: Account[]; employees: Employee[]; services: Service[]; language: Language; session: Session; onSubmit: (entry: JobEntry) => void }) {
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

function AccountFields({ accounts, draft, update, language }: { accounts: Account[]; draft: Draft; update: (partial: Partial<Draft>) => void; language: Language }) {
  const t = copy[language];
  const activeAccounts = accounts
    .filter((account) => account.active)
    .sort((left, right) => left.canonicalName.localeCompare(right.canonicalName));
  return (
    <div className="grid">
      <div className="field">
        <label>{t.account}</label>
        <select className="select" value={draft.accountId} onChange={(event) => update({ accountId: event.target.value })}>
          <option value="">{t.chooseAccount}</option>
          {activeAccounts.filter((account) => account.isFavorite).map((account) => <option key={account.id} value={account.id}>Favorite - {account.canonicalName}</option>)}
          {activeAccounts.filter((account) => !account.isFavorite).map((account) => <option key={account.id} value={account.id}>{account.canonicalName}</option>)}
          <option value="other">{t.otherCleanup}</option>
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
        <input className="input" aria-label={t.hours} value={draft.startTime && draft.finishTime ? `${draft.overrideHours ? roundApprovedHours(Number(draft.overrideHours)) : calculated} ${t.hoursLower}` : ""} placeholder={`0 ${t.hoursLower}`} readOnly />
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
        <input
          className="input"
          inputMode="decimal"
          value={draft.overrideHours}
          onChange={(event) => update({ overrideHours: event.target.value })}
          onBlur={(event) => {
            const rounded = roundApprovedHours(Number(event.target.value));
            if (Number.isFinite(rounded) && rounded > 0) update({ overrideHours: String(rounded) });
          }}
          placeholder={t.optional}
          aria-label={t.override}
        />
      </div>
      <div className="field">
        <label>{t.reason}</label>
        <input className="input" value={draft.overrideReason} onChange={(event) => update({ overrideReason: event.target.value })} disabled={!draft.overrideHours} aria-label={t.reason} />
      </div>
    </div>
  );
}

function ServiceFields({ services, draft, update, language }: { services: Service[]; draft: Draft; update: (partial: Partial<Draft>) => void; language: Language }) {
  const t = copy[language];
  function toggleService(id: string) {
    update({ serviceIds: draft.serviceIds.includes(id) ? draft.serviceIds.filter((item) => item !== id) : [...draft.serviceIds, id] });
  }
  return (
    <div className="grid">
      <label className="muted small">{t.service}</label>
      <div className="segmented">
        {services.filter((service) => service.active).map((service) => (
          <button key={service.id} className={`chip ${draft.serviceIds.includes(service.id) ? "active" : ""}`} aria-pressed={draft.serviceIds.includes(service.id)} onClick={() => toggleService(service.id)}>
            {draft.serviceIds.includes(service.id) ? <Check size={16} /> : <Search size={16} />} {service.label[language]}
          </button>
        ))}
      </div>
      <div className="field">
        <label>{t.otherService}</label>
        <input className="input" value={draft.rawServiceText} onChange={(event) => update({ rawServiceText: event.target.value })} placeholder={t.optional} aria-label={t.otherService} />
      </div>
    </div>
  );
}

function RecentEntries({ entries, accounts, language, employeeId }: { entries: JobEntry[]; accounts: Account[]; language: Language; employeeId: string }) {
  return (
    <section className="panel grid">
      <HeaderLine title={copy[language].recent} subtitle={copy[language].recentSubtitle} />
      <div className="list">
        {entries.map((entry) => {
          const line = entry.workerLines.find((item) => item.employeeId === employeeId);
          return (
            <div className="row" key={entry.id}>
              <div>
                <strong>{accountLabel(accounts, entry.accountId, entry.rawAccountText)}</strong>
                <div className="small muted">{entry.workDate} / {line?.approvedHours ?? entry.defaultCalculatedHours} {copy[language].hoursLower}</div>
              </div>
              <span className={`badge ${entry.flags.length ? "warn" : ""}`}>{entry.flags.length ? copy[language].needsReview : copy[language].approved}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function AdminDashboard({ entries, setEntries, accounts, setAccounts, employees, setEmployees, services, setServices, totals, flaggedEntries, adminSaveNotice, saveAdminState }: {
  entries: JobEntry[];
  setEntries: (entries: JobEntry[]) => void;
  accounts: Account[];
  setAccounts: (accounts: Account[]) => void;
  employees: Employee[];
  setEmployees: (employees: Employee[]) => void;
  services: Service[];
  setServices: (services: Service[]) => void;
  totals: ReturnType<typeof summarize>;
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
        <Stat label="Period hours" value={totals.totalHours.toFixed(1)} />
        <Stat label="Employees" value={employees.filter((employee) => employee.active).length} />
      </div>
      <div className="panel grid">
        <HeaderLine
          title="Payroll close"
          subtitle="Resolve flags, classify REG/OT/DT, then export."
          right={
            <div className="segmented">
              <a className="secondary" href="/api/export/report" target="_blank" rel="noreferrer"><FileText size={18} /> Report</a>
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

function AccountManager({ accounts, setAccounts, entries }: { accounts: Account[]; setAccounts: (accounts: Account[]) => void; entries: JobEntry[] }) {
  const [newName, setNewName] = useState("");
  const [newFavorite, setNewFavorite] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editFavorite, setEditFavorite] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const sortedAccounts = [...accounts].sort((left, right) => Number(right.active) - Number(left.active) || left.canonicalName.localeCompare(right.canonicalName));

  function nameExists(name: string, exceptId?: string) {
    const normalized = normalizeName(name);
    return accounts.some((account) => account.id !== exceptId && normalizeName(account.canonicalName) === normalized);
  }

  function addAccount() {
    const canonicalName = newName.trim();
    if (!canonicalName) {
      setNotice("Enter a customer name before adding it.");
      return;
    }
    if (nameExists(canonicalName)) {
      setNotice("That customer name already exists.");
      return;
    }
    const nextAccount: Account = {
      id: uniqueAccountId(canonicalName, accounts),
      canonicalName,
      active: true,
      isFavorite: newFavorite
    };
    setAccounts([...accounts, nextAccount]);
    setNewName("");
    setNewFavorite(false);
    setNotice(`Added ${canonicalName}.`);
  }

  function startEdit(account: Account) {
    setEditingId(account.id);
    setEditName(account.canonicalName);
    setEditFavorite(account.isFavorite);
    setNotice(null);
  }

  function saveEdit(accountId: string) {
    const canonicalName = editName.trim();
    if (!canonicalName) {
      setNotice("Customer name cannot be blank.");
      return;
    }
    if (nameExists(canonicalName, accountId)) {
      setNotice("Another customer already uses that name.");
      return;
    }
    setAccounts(accounts.map((account) => account.id === accountId ? { ...account, canonicalName, isFavorite: editFavorite, active: true } : account));
    setEditingId(null);
    setEditName("");
    setNotice(`Updated ${canonicalName}.`);
  }

  function deleteAccount(account: Account) {
    const usedInEntries = entries.some((entry) => entry.accountId === account.id);
    if (usedInEntries) {
      setAccounts(accounts.map((item) => item.id === account.id ? { ...item, active: false, isFavorite: false } : item));
      setNotice(`${account.canonicalName} was archived because past entries still reference it.`);
      return;
    }
    setAccounts(accounts.filter((item) => item.id !== account.id));
    setNotice(`Deleted ${account.canonicalName}.`);
  }

  return (
    <div className="card list master-data-manager">
      <strong>Customer accounts</strong>
      <div className="field">
        <label>New customer/account name</label>
        <input className="input" value={newName} onChange={(event) => setNewName(event.target.value)} placeholder="Example: Belimo" />
      </div>
      <label className="checkline">
        <input type="checkbox" checked={newFavorite} onChange={(event) => setNewFavorite(event.target.checked)} />
        Favorite / show first
      </label>
      <button className="primary" onClick={addAccount}>Add customer</button>
      {notice && <p className="small muted" role="status">{notice}</p>}
      <div className="list compact-list">
        {sortedAccounts.map((account) => (
          <div className={`row master-data-row ${account.active ? "" : "inactive"}`} key={account.id}>
            {editingId === account.id ? (
              <div className="grid master-data-edit">
                <input className="input" value={editName} onChange={(event) => setEditName(event.target.value)} aria-label={`Edit ${account.canonicalName}`} />
                <label className="checkline">
                  <input type="checkbox" checked={editFavorite} onChange={(event) => setEditFavorite(event.target.checked)} />
                  Favorite
                </label>
                <div className="segmented master-data-actions">
                  <button className="primary" onClick={() => saveEdit(account.id)}>Save</button>
                  <button className="secondary" onClick={() => setEditingId(null)}>Cancel</button>
                </div>
              </div>
            ) : (
              <>
                <div>
                  <strong>{account.canonicalName}</strong>
                  <div className="small muted">{account.active ? (account.isFavorite ? "Favorite" : "Active") : "Archived"}</div>
                </div>
                <div className="segmented master-data-actions">
                  <button className="secondary" onClick={() => startEdit(account)}>Change</button>
                  <button className="danger" onClick={() => deleteAccount(account)}>Delete</button>
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function EmployeeManager({ employees, setEmployees, entries }: { employees: Employee[]; setEmployees: (employees: Employee[]) => void; entries: JobEntry[] }) {
  const [newName, setNewName] = useState("");
  const [newRole, setNewRole] = useState<Role>("worker");
  const [newLanguage, setNewLanguage] = useState<Language>("en");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editRole, setEditRole] = useState<Role>("worker");
  const [editLanguage, setEditLanguage] = useState<Language>("en");
  const [notice, setNotice] = useState<string | null>(null);
  const sortedEmployees = [...employees].sort((left, right) => Number(right.active) - Number(left.active) || left.name.localeCompare(right.name));

  function nameExists(name: string, exceptId?: string) {
    const normalized = normalizeName(name);
    return employees.some((employee) => employee.id !== exceptId && normalizeName(employee.name) === normalized);
  }

  function addEmployee() {
    const name = newName.trim();
    if (!name) {
      setNotice("Enter an employee name before adding it.");
      return;
    }
    if (nameExists(name)) {
      setNotice("That employee already exists.");
      return;
    }
    const nextEmployee: Employee = {
      id: uniqueSlugId(name, employees.map((employee) => employee.id), "employee"),
      name,
      role: newRole,
      active: true,
      preferredLanguage: newLanguage
    };
    setEmployees([...employees, nextEmployee]);
    setNewName("");
    setNewRole("worker");
    setNewLanguage("en");
    setNotice(`Added ${name}.`);
  }

  function startEdit(employee: Employee) {
    setEditingId(employee.id);
    setEditName(employee.name);
    setEditRole(employee.role);
    setEditLanguage(employee.preferredLanguage ?? "en");
    setNotice(null);
  }

  function saveEdit(employeeId: string) {
    const name = editName.trim();
    if (!name) {
      setNotice("Employee name cannot be blank.");
      return;
    }
    if (nameExists(name, employeeId)) {
      setNotice("Another employee already uses that name.");
      return;
    }
    setEmployees(employees.map((employee) => employee.id === employeeId ? { ...employee, name, role: editRole, preferredLanguage: editLanguage, active: true } : employee));
    setEditingId(null);
    setNotice(`Updated ${name}.`);
  }

  function deleteEmployee(employee: Employee) {
    const activeAdminCount = employees.filter((item) => item.active && item.role === "admin").length;
    if (employee.role === "admin" && activeAdminCount <= 1) {
      setNotice("Keep at least one active admin.");
      return;
    }
    const usedInEntries = entries.some((entry) => entry.submittedByEmployeeId === employee.id || entry.workerLines.some((line) => line.employeeId === employee.id));
    if (usedInEntries) {
      setEmployees(employees.map((item) => item.id === employee.id ? { ...item, active: false } : item));
      setNotice(`${employee.name} was archived because past entries still reference them.`);
      return;
    }
    setEmployees(employees.filter((item) => item.id !== employee.id));
    setNotice(`Deleted ${employee.name}.`);
  }

  return (
    <div className="card list master-data-manager">
      <strong>Employees</strong>
      <div className="field">
        <label>New employee name</label>
        <input className="input" value={newName} onChange={(event) => setNewName(event.target.value)} placeholder="Example: Jonathan" />
      </div>
      <div className="grid two compact-form">
        <select className="select" value={newRole} onChange={(event) => setNewRole(event.target.value as Role)} aria-label="New employee role">
          <option value="worker">Worker</option>
          <option value="crew_lead">Crew lead</option>
          <option value="admin">Admin</option>
        </select>
        <select className="select" value={newLanguage} onChange={(event) => setNewLanguage(event.target.value as Language)} aria-label="New employee language">
          <option value="en">English</option>
          <option value="es">Spanish</option>
          <option value="pt">Portuguese</option>
        </select>
      </div>
      <button className="primary" onClick={addEmployee}>Add employee</button>
      {notice && <p className="small muted" role="status">{notice}</p>}
      <div className="list compact-list">
        {sortedEmployees.map((employee) => (
          <div className={`row master-data-row ${employee.active ? "" : "inactive"}`} key={employee.id}>
            {editingId === employee.id ? (
              <div className="grid master-data-edit">
                <input className="input" value={editName} onChange={(event) => setEditName(event.target.value)} aria-label={`Edit ${employee.name}`} />
                <div className="grid two compact-form">
                  <select className="select" value={editRole} onChange={(event) => setEditRole(event.target.value as Role)} aria-label={`Role for ${employee.name}`}>
                    <option value="worker">Worker</option>
                    <option value="crew_lead">Crew lead</option>
                    <option value="admin">Admin</option>
                  </select>
                  <select className="select" value={editLanguage} onChange={(event) => setEditLanguage(event.target.value as Language)} aria-label={`Language for ${employee.name}`}>
                    <option value="en">English</option>
                    <option value="es">Spanish</option>
                    <option value="pt">Portuguese</option>
                  </select>
                </div>
                <div className="segmented master-data-actions">
                  <button className="primary" onClick={() => saveEdit(employee.id)}>Save</button>
                  <button className="secondary" onClick={() => setEditingId(null)}>Cancel</button>
                </div>
              </div>
            ) : (
              <>
                <div>
                  <strong>{employee.name}</strong>
                  <div className="small muted">{employee.active ? `${employee.role} / ${(employee.preferredLanguage ?? "en").toUpperCase()}` : "Archived"}</div>
                </div>
                <div className="segmented master-data-actions">
                  <button className="secondary" onClick={() => startEdit(employee)}>Change</button>
                  <button className="danger" onClick={() => deleteEmployee(employee)}>Delete</button>
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function ServiceManager({ services, setServices, entries }: { services: Service[]; setServices: (services: Service[]) => void; entries: JobEntry[] }) {
  const [newEnglish, setNewEnglish] = useState("");
  const [newSpanish, setNewSpanish] = useState("");
  const [newPortuguese, setNewPortuguese] = useState("");
  const [newCommon, setNewCommon] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editEnglish, setEditEnglish] = useState("");
  const [editSpanish, setEditSpanish] = useState("");
  const [editPortuguese, setEditPortuguese] = useState("");
  const [editCommon, setEditCommon] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const sortedServices = [...services].sort((left, right) => Number(right.active) - Number(left.active) || left.label.en.localeCompare(right.label.en));

  function nameExists(name: string, exceptId?: string) {
    const normalized = normalizeName(name);
    return services.some((service) => service.id !== exceptId && normalizeName(service.label.en) === normalized);
  }

  function addService() {
    const english = newEnglish.trim();
    if (!english) {
      setNotice("Enter the English service name before adding it.");
      return;
    }
    if (nameExists(english)) {
      setNotice("That service already exists.");
      return;
    }
    const id = uniqueSlugId(english, services.map((service) => service.id), "service");
    const nextService: Service = {
      id,
      canonicalKey: id.replace(/-/g, "_"),
      label: {
        en: english,
        es: newSpanish.trim() || english,
        pt: newPortuguese.trim() || english
      },
      active: true,
      isCommon: newCommon
    };
    setServices([...services, nextService]);
    setNewEnglish("");
    setNewSpanish("");
    setNewPortuguese("");
    setNewCommon(false);
    setNotice(`Added ${english}.`);
  }

  function startEdit(service: Service) {
    setEditingId(service.id);
    setEditEnglish(service.label.en);
    setEditSpanish(service.label.es);
    setEditPortuguese(service.label.pt);
    setEditCommon(service.isCommon);
    setNotice(null);
  }

  function saveEdit(serviceId: string) {
    const english = editEnglish.trim();
    if (!english) {
      setNotice("Service name cannot be blank.");
      return;
    }
    if (nameExists(english, serviceId)) {
      setNotice("Another service already uses that name.");
      return;
    }
    setServices(services.map((service) => service.id === serviceId ? {
      ...service,
      label: {
        en: english,
        es: editSpanish.trim() || english,
        pt: editPortuguese.trim() || english
      },
      isCommon: editCommon,
      active: true
    } : service));
    setEditingId(null);
    setNotice(`Updated ${english}.`);
  }

  function deleteService(service: Service) {
    const usedInEntries = entries.some((entry) => entry.serviceIds.includes(service.id));
    if (usedInEntries) {
      setServices(services.map((item) => item.id === service.id ? { ...item, active: false, isCommon: false } : item));
      setNotice(`${service.label.en} was archived because past entries still reference it.`);
      return;
    }
    setServices(services.filter((item) => item.id !== service.id));
    setNotice(`Deleted ${service.label.en}.`);
  }

  return (
    <div className="card list master-data-manager">
      <strong>Services</strong>
      <div className="field">
        <label>New service name</label>
        <input className="input" value={newEnglish} onChange={(event) => setNewEnglish(event.target.value)} placeholder="English" />
      </div>
      <div className="grid two compact-form">
        <input className="input" value={newSpanish} onChange={(event) => setNewSpanish(event.target.value)} placeholder="Spanish label" aria-label="New service Spanish label" />
        <input className="input" value={newPortuguese} onChange={(event) => setNewPortuguese(event.target.value)} placeholder="Portuguese label" aria-label="New service Portuguese label" />
      </div>
      <label className="checkline">
        <input type="checkbox" checked={newCommon} onChange={(event) => setNewCommon(event.target.checked)} />
        Common / show as big button
      </label>
      <button className="primary" onClick={addService}>Add service</button>
      {notice && <p className="small muted" role="status">{notice}</p>}
      <div className="list compact-list">
        {sortedServices.map((service) => (
          <div className={`row master-data-row ${service.active ? "" : "inactive"}`} key={service.id}>
            {editingId === service.id ? (
              <div className="grid master-data-edit">
                <input className="input" value={editEnglish} onChange={(event) => setEditEnglish(event.target.value)} aria-label={`Edit ${service.label.en}`} />
                <div className="grid two compact-form">
                  <input className="input" value={editSpanish} onChange={(event) => setEditSpanish(event.target.value)} aria-label={`Spanish label for ${service.label.en}`} />
                  <input className="input" value={editPortuguese} onChange={(event) => setEditPortuguese(event.target.value)} aria-label={`Portuguese label for ${service.label.en}`} />
                </div>
                <label className="checkline">
                  <input type="checkbox" checked={editCommon} onChange={(event) => setEditCommon(event.target.checked)} />
                  Common
                </label>
                <div className="segmented master-data-actions">
                  <button className="primary" onClick={() => saveEdit(service.id)}>Save</button>
                  <button className="secondary" onClick={() => setEditingId(null)}>Cancel</button>
                </div>
              </div>
            ) : (
              <>
                <div>
                  <strong>{service.label.en}</strong>
                  <div className="small muted">{service.active ? (service.isCommon ? "Common" : "Full list") : "Archived"}</div>
                </div>
                <div className="segmented master-data-actions">
                  <button className="secondary" onClick={() => startEdit(service)}>Change</button>
                  <button className="danger" onClick={() => deleteService(service)}>Delete</button>
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function normalizeName(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function uniqueSlugId(name: string, usedIds: string[], fallback: string) {
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

function uniqueAccountId(name: string, existingAccounts: Account[]) {
  return uniqueSlugId(name, existingAccounts.map((account) => account.id), "account");
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

function accountLabel(accountList: Account[], accountId?: string, raw?: string) {
  if (raw) return raw;
  return accountList.find((account) => account.id === accountId)?.canonicalName ?? "Unknown account";
}

function serviceSummary(serviceList: Service[], entry: JobEntry) {
  const labels = entry.serviceIds.map((serviceId) => serviceList.find((service) => service.id === serviceId)?.label.en ?? serviceId);
  return [...labels, entry.rawServiceText].filter(Boolean).join(", ") || "No service";
}

function summarize(entries: JobEntry[], accountList: Account[], employeeList: Employee[], serviceList: Service[]) {
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
