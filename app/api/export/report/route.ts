import { NextResponse } from "next/server";
import { loadServerAppState } from "../../../../lib/server-state";
import type { Account, Employee, JobEntry, Service, WorkerLine } from "../../../../lib/types";

type ReportLine = {
  entry: JobEntry;
  line: WorkerLine;
};

export async function GET() {
  const { state } = await loadServerAppState();
  const { accounts, employees, entries, services } = state;
  const lines = entries.flatMap((entry) => entry.workerLines.map((line) => ({ entry, line })));
  const cleanLines = lines.filter(({ entry }) => entry.status === "approved" && entry.flags.length === 0);
  const reviewLines = lines.filter(({ entry }) => entry.status !== "approved" || entry.flags.length > 0);
  const range = dateRange(entries);
  const html = renderReport({
    accounts,
    employees,
    services,
    entries,
    lines,
    cleanLines,
    reviewLines,
    range
  });

  return new NextResponse(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "content-disposition": `inline; filename=preferred-maintenance-payroll-report-${range.file}.html`
    }
  });
}

function renderReport(input: {
  accounts: Account[];
  employees: Employee[];
  services: Service[];
  entries: JobEntry[];
  lines: ReportLine[];
  cleanLines: ReportLine[];
  reviewLines: ReportLine[];
  range: { label: string; file: string };
}) {
  const allHours = sum(input.lines.map(({ line }) => line.approvedHours));
  const cleanHours = sum(input.cleanLines.map(({ line }) => line.approvedHours));
  const reviewHours = sum(input.reviewLines.map(({ line }) => line.approvedHours));
  const workerCards = groupLines(input.cleanLines, ({ line }) => employeeName(input.employees, line.employeeId))
    .sort((left, right) => right.hours - left.hours);
  const locationRows = groupLines(input.cleanLines, ({ entry }) => accountName(input.accounts, entry.accountId, entry.rawAccountText))
    .sort((left, right) => right.hours - left.hours);

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Payroll Report ${escapeHtml(input.range.label)}</title>
<style>${reportCss()}</style>
</head>
<body>
<div class="wrap">
  <div class="hero">
    <div class="sub">Preferred Maintenance &middot; Payroll report</div>
    <h1>Payroll ${escapeHtml(input.range.label)}</h1>
    <div class="sub">Generated ${escapeHtml(formatDateTime(new Date()))} from Special Project Hours. Review rows kept separate. Hours kept exactly as approved.</div>
    <div class="chips">
      ${metric("App total", `${allHours.toFixed(2)} hrs`)}
      ${metric("Clean releasable", `${cleanHours.toFixed(2)} hrs`)}
      ${metric("Review hold", `${reviewHours.toFixed(2)} hrs`)}
      ${metric("Entries", String(input.entries.length))}
    </div>
  </div>

  <div class="section">
    <h2>By worker / team - clean releasable rows only</h2>
    <div class="cards">
      ${workerCards.length ? workerCards.map((item) => workerCard(item.name, item.hours, item.jobs, item.refs)).join("") : empty("No clean releasable rows.")}
    </div>
  </div>

  <div class="section">
    <h2>Review holds before assigning pay</h2>
    ${reviewTable(input)}
    <p class="small">These rows stay out of clean payroll totals until the admin resolves the flags.</p>
  </div>

  <div class="section">
    <h2>Unpaid entries - app rows</h2>
    ${entryTable(input)}
  </div>

  <div class="section">
    <h2>By location - clean releasable rows only</h2>
    ${locationTable(locationRows)}
  </div>

  <div class="section">
    <h2>Verification</h2>
    <table class="table"><tbody>
      <tr><td>Data source</td><td>Special Project Hours Supabase app state</td></tr>
      <tr><td>Review rows separated</td><td class="ok">Yes</td></tr>
      <tr><td>Hours used exactly as approved</td><td class="ok">Yes</td></tr>
      <tr><td>Shared hours split</td><td class="ok">No automatic splitting</td></tr>
      <tr><td>Flagged rows held</td><td>${escapeHtml(String(input.reviewLines.length))} worker row(s)</td></tr>
    </tbody></table>
  </div>

  <div class="footer">Notes: Worker names, account names, services, notes, and flags are preserved from the app data. Clean releasable totals exclude unresolved flags.</div>
</div>
</body>
</html>`;
}

function reportCss() {
  return `:root{--bg:#0b1020;--card:#121933;--muted:#8ea0c8;--text:#eff4ff;--accent:#6ee7ff;--good:#22c55e;--warn:#f59e0b;--bad:#ef4444;--line:#243055}*{box-sizing:border-box}body{margin:0;background:linear-gradient(180deg,#0a0f1d,#0f1730);color:var(--text);font:15px/1.45 Inter,Segoe UI,Arial,sans-serif;padding:24px}.wrap{max-width:980px;margin:0 auto}.hero{background:linear-gradient(135deg,#131c3c,#0c1329 60%,#1d1142);border:1px solid #33406c;border-radius:24px;padding:24px 24px 18px;box-shadow:0 12px 40px rgba(0,0,0,.35)}h1{margin:0 0 8px;font-size:34px;line-height:1.05}.sub{color:#c7d3f7;font-size:16px}.chips{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-top:18px}.chip{background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.09);border-radius:16px;padding:14px}.chip .k{font-size:12px;color:var(--muted);text-transform:uppercase;letter-spacing:.08em}.chip .v{margin-top:6px;font-size:22px;font-weight:700}.section{margin-top:18px;background:rgba(13,19,40,.82);border:1px solid var(--line);border-radius:20px;padding:18px 18px 12px}h2{margin:0 0 12px;font-size:22px}.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px}.card{background:linear-gradient(180deg,#121a35,#0d142b);border:1px solid #27345b;border-radius:18px;padding:14px}.card h3{margin:0;font-size:18px}.meta{margin-top:8px;color:var(--muted);font-size:13px}.hours{margin-top:10px;font-size:28px;font-weight:800;color:#fff}.table{width:100%;border-collapse:collapse;margin-top:8px}.table th,.table td{padding:10px;border-bottom:1px solid #233055;vertical-align:top}.table th{text-align:left;font-size:12px;color:var(--muted);text-transform:uppercase;letter-spacing:.08em}.small{font-size:13px;color:var(--muted)}.right{text-align:right}.ok{color:var(--good);font-weight:700}.warn{color:var(--warn);font-weight:700}.bad{color:var(--bad);font-weight:700}.footer{margin-top:18px;color:var(--muted);font-size:13px}@media (max-width:760px){body{padding:14px}.chips{grid-template-columns:repeat(2,minmax(0,1fr))}h1{font-size:28px}.section{padding:14px}.table th,.table td{padding:8px 6px;font-size:13px}}`;
}

function metric(label: string, value: string) {
  return `<div class="chip"><div class="k">${escapeHtml(label)}</div><div class="v">${escapeHtml(value)}</div></div>`;
}

function workerCard(name: string, hours: number, jobs: number, refs: string[]) {
  return `<div class="card"><h3>${escapeHtml(name)}</h3><div class="hours">${hours.toFixed(2)} hrs</div><div class="meta">${jobs} job${jobs === 1 ? "" : "s"} &middot; rows ${escapeHtml(refs.join(", "))}</div></div>`;
}

function reviewTable(input: { accounts: Account[]; employees: Employee[]; reviewLines: ReportLine[] }) {
  if (!input.reviewLines.length) return `<p class="small">No review holds.</p>`;
  const rows = input.reviewLines.map(({ entry, line }) => `<tr><td>${ref(entry)}</td><td>${escapeHtml(formatShortDate(entry.workDate))}</td><td>${escapeHtml(employeeName(input.employees, line.employeeId))}</td><td>${escapeHtml(accountName(input.accounts, entry.accountId, entry.rawAccountText))}</td><td class="right">${line.approvedHours.toFixed(2)}</td><td>${escapeHtml(entry.flags.join("; ") || entry.status)}</td></tr>`).join("");
  return `<table class="table"><thead><tr><th>Row</th><th>Date</th><th>Worker / Team</th><th>Location</th><th class="right">Hours</th><th>Reason</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function entryTable(input: { accounts: Account[]; employees: Employee[]; services: Service[]; lines: ReportLine[] }) {
  if (!input.lines.length) return `<p class="small">No entries yet.</p>`;
  const rows = input.lines.map(({ entry, line }) => `<tr><td>${escapeHtml(formatShortDate(entry.workDate))}</td><td>${escapeHtml(employeeName(input.employees, line.employeeId))}</td><td>${escapeHtml(accountName(input.accounts, entry.accountId, entry.rawAccountText))}</td><td class="right">${line.approvedHours.toFixed(2)}</td><td>${escapeHtml(serviceList(input.services, entry))}</td><td>${escapeHtml(entry.notes ?? "")}</td><td class="small">${ref(entry)}</td></tr>`).join("");
  return `<table class="table"><thead><tr><th>Date</th><th>Worker / Team</th><th>Location</th><th class="right">Hours</th><th>Services</th><th>Notes</th><th>Row</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function locationTable(rows: { name: string; hours: number; jobs: number; refs: string[] }[]) {
  if (!rows.length) return `<p class="small">No clean releasable rows.</p>`;
  const body = rows.map((row) => `<tr><td>${escapeHtml(row.name)}</td><td class="right">${row.hours.toFixed(2)}</td><td class="right">${row.jobs}</td><td class="small">${escapeHtml(row.refs.join(", "))}</td></tr>`).join("");
  return `<table class="table"><thead><tr><th>Location</th><th class="right">Hours</th><th class="right">Jobs</th><th>Rows</th></tr></thead><tbody>${body}</tbody></table>`;
}

function groupLines(lines: ReportLine[], nameFor: (line: ReportLine) => string) {
  const map = new Map<string, { name: string; hours: number; entries: Set<string>; refs: Set<string> }>();
  for (const item of lines) {
    const name = nameFor(item);
    const existing = map.get(name) ?? { name, hours: 0, entries: new Set<string>(), refs: new Set<string>() };
    existing.hours += item.line.approvedHours;
    existing.entries.add(item.entry.id);
    existing.refs.add(ref(item.entry));
    map.set(name, existing);
  }
  return [...map.values()].map((item) => ({ name: item.name, hours: sum([item.hours]), jobs: item.entries.size, refs: [...item.refs] }));
}

function dateRange(entries: JobEntry[]) {
  const dates = entries.map((entry) => entry.workDate).filter(Boolean).sort();
  if (!dates.length) return { label: "for current period", file: "current-period" };
  const first = dates[0];
  const last = dates[dates.length - 1];
  const label = first === last ? `for ${formatDisplayDate(first)}` : `from ${formatDisplayDate(first)} to ${formatDisplayDate(last)}`;
  return { label, file: `${first}_to_${last}` };
}

function formatDisplayDate(value: string) {
  const [year, month, day] = value.split("-");
  return `${month}/${day}/${year}`;
}

function formatShortDate(value: string) {
  const [, month, day] = value.split("-");
  return `${month}/${day}`;
}

function formatDateTime(date: Date) {
  return new Intl.DateTimeFormat("en-US", { dateStyle: "short", timeStyle: "short", timeZone: "America/New_York" }).format(date);
}

function employeeName(employees: Employee[], id: string) {
  return employees.find((employee) => employee.id === id)?.name ?? id;
}

function accountName(accounts: Account[], id?: string, raw?: string) {
  return raw || accounts.find((account) => account.id === id)?.canonicalName || "Unknown";
}

function serviceList(services: Service[], entry: JobEntry) {
  const canonical = entry.serviceIds.map((serviceId) => services.find((service) => service.id === serviceId)?.label.en ?? serviceId);
  return [...canonical, entry.rawServiceText].filter(Boolean).join(", ");
}

function ref(entry: JobEntry) {
  return entry.id.slice(0, 8);
}

function sum(values: number[]) {
  return Math.round(values.reduce((total, value) => total + value, 0) * 100) / 100;
}

function empty(text: string) {
  return `<p class="small">${escapeHtml(text)}</p>`;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] ?? char);
}
