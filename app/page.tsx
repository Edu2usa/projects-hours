"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarRange, LogOut, Send, ShieldCheck, Users } from "lucide-react";
import { accounts as seedAccounts, demoEntries, employees as seedEmployees, services as seedServices } from "../lib/demo-data";
import { copy, languages } from "../lib/i18n";
import { clearDraft, clearSession, loadAccounts, loadDraft, loadEmployees, loadEntries, loadServices, loadSession, saveAccounts, saveDraft, saveEmployees, saveEntries, saveServices, saveSession } from "../lib/storage";
import { loadRemoteAppState, saveRemoteAppState, saveRemoteEntry } from "../lib/app-state";
import type { Account, Employee, JobEntry, Language, Service, Session } from "../lib/types";
import { AdminDashboard } from "./components/AdminDashboard";
import { CrewEntry } from "./components/CrewEntry";
import { createEmptyDraft, type Draft, type Screen } from "./components/drafts";
import { accountLabel, summarize } from "./components/helpers";
import { Login } from "./components/Login";
import { QuickEntry } from "./components/QuickEntry";
import { RecentEntries } from "./components/RecentEntries";
import { Shell } from "./components/ui";

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
            accounts={accountList}
            services={serviceList}
            draft={draft}
            setDraft={setDraft}
            language={language}
            session={session}
            submitNotice={submitNotice}
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
