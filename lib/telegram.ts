import { formatDisplayDate, isInPeriod, latestFridayPayrollPeriod } from "./payroll";
import type { AppState } from "./app-state";
import type { Account, Employee, JobEntry, Service, WorkerLine } from "./types";

export type TelegramResult = {
  chatId: string;
  ok: boolean;
  status?: number;
  messageId?: number;
  error?: string;
};

export async function sendTelegramMessage(text: string, chatIds = telegramChatIds("entry"), captureReceipt = false) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token || chatIds.length === 0) {
    return { configured: false, results: [] as TelegramResult[] };
  }

  const results = await Promise.all(chatIds.map(async (chatId) => {
    try {
      const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: "POST",
        ...(captureReceipt ? { signal: AbortSignal.timeout(20_000), redirect: "error" as const } : {}),
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          disable_web_page_preview: true
        })
      });
      if (captureReceipt) {
        // The test distinguishes API acceptance from an HTTP 200/error body.
        // Keep only message IDs, never provider text or returned user/chat data.
        const data = await response.json().catch(() => null);
        const messageId = data?.result?.message_id;
        const accepted = response.ok && data?.ok === true && Number.isSafeInteger(messageId) && messageId > 0;
        return accepted
          ? { chatId, ok: true, status: response.status, messageId: messageId as number }
          : { chatId, ok: false, status: response.status, error: "telegram_receipt_unconfirmed" };
      }
      return { chatId, ok: response.ok, status: response.status };
    } catch (error) {
      return { chatId, ok: false, error: captureReceipt ? "telegram_transport_error" : error instanceof Error ? error.message : String(error) };
    }
  }));

  return { configured: true, results };
}

export async function notifyNewEntry(state: AppState, entry: JobEntry) {
  return sendTelegramMessage(formatEntryAlert(state, entry), telegramChatIds("entry"));
}

export async function notifyWeeklyReport(state: AppState, origin: string) {
  const message = formatWeeklyReport(state, origin);
  return sendTelegramMessage(message, telegramChatIds("report"));
}

export function telegramChatIds(kind: "entry" | "report") {
  const raw = kind === "entry"
    ? process.env.TELEGRAM_ENTRY_CHAT_IDS || process.env.TELEGRAM_ADMIN_CHAT_ID || ""
    : process.env.TELEGRAM_REPORT_CHAT_IDS ||
      process.env.TELEGRAM_HERMES_CHAT_ID ||
      process.env.TELEGRAM_ADMIN_CHAT_ID ||
      "";

  return raw
    .split(",")
    .map((chatId) => chatId.trim())
    .filter(Boolean);
}

function formatEntryAlert(state: AppState, entry: JobEntry) {
  const submitter = employeeName(state.employees, entry.submittedByEmployeeId);
  const account = accountName(state.accounts, entry.accountId, entry.rawAccountText);
  const services = serviceList(state.services, entry);
  const totalHours = sum(entry.workerLines.map((line) => line.approvedHours));
  const workers = entry.workerLines
    .map((line) => `${employeeName(state.employees, line.employeeId)}: ${line.approvedHours.toFixed(2)} hrs`)
    .join("\n");
  const flags = entry.flags.length ? `\nFlags: ${entry.flags.join(", ")}` : "";
  const notes = entry.notes ? `\nNotes: ${entry.notes}` : "";

  return [
    "Preferred Maintenance - New hours entry",
    `Submission ID: ${entry.id}`,
    `Submitted by: ${submitter}`,
    `Date: ${formatDisplayDate(entry.workDate)}`,
    `Account/site: ${account}`,
    `Services: ${services || "None selected"}`,
    `Time: ${formatTime(entry.defaultStartTime)} to ${formatTime(entry.defaultFinishTime)}`,
    `Total: ${totalHours.toFixed(2)} hrs`,
    "Workers:",
    workers,
    `Status: ${entry.status}${flags}${notes}`
  ].join("\n");
}

function formatWeeklyReport(state: AppState, origin: string) {
  // Report on the payroll period containing the most recent Friday: on the
  // Monday after a period closes that is the finished payroll, mid-period it
  // is the running payroll with week 1 complete.
  const { period, closed } = latestFridayPayrollPeriod();
  const rangeEntries = state.entries.filter((entry) => isInPeriod(entry.workDate, period));
  const lines = rangeEntries.flatMap((entry) => entry.workerLines.map((line) => ({ entry, line })));
  const cleanLines = lines.filter(({ entry }) => entry.status === "approved" && entry.flags.length === 0);
  const reviewLines = lines.filter(({ entry }) => entry.status !== "approved" || entry.flags.length > 0);
  const byWorker = topGroups(cleanLines, ({ line }) => employeeName(state.employees, line.employeeId));
  const byAccount = topGroups(cleanLines, ({ entry }) => accountName(state.accounts, entry.accountId, entry.rawAccountText));
  const cleanHours = sum(cleanLines.map(({ line }) => line.approvedHours));
  const reviewHours = sum(reviewLines.map(({ line }) => line.approvedHours));
  const reportUrl = `${origin}/api/export/report?period=${period.end}`;
  const excelUrl = `${origin}/api/export/excel?period=${period.end}`;
  const pdfUrl = `${origin}/api/export/pdf?period=${period.end}`;

  return [
    `Preferred Maintenance - Biweekly payroll report`,
    `Payroll period: ${period.label}`,
    closed
      ? `Status: CLOSED ${formatDisplayDate(period.end)} - ready for payroll`
      : `Status: week 1 complete (ended ${formatDisplayDate(period.week1End)}), week 2 ends ${formatDisplayDate(period.end)}`,
    `Entries: ${rangeEntries.length}`,
    `Clean hours: ${cleanHours.toFixed(2)}`,
    `Review hold hours: ${reviewHours.toFixed(2)}`,
    "",
    "Top workers:",
    byWorker.length ? byWorker.map((row) => `${row.name}: ${row.hours.toFixed(2)} hrs`).join("\n") : "No clean worker hours this week.",
    "",
    "Top accounts:",
    byAccount.length ? byAccount.map((row) => `${row.name}: ${row.hours.toFixed(2)} hrs`).join("\n") : "No clean account hours this week.",
    "",
    `Blue report: ${reportUrl}`,
    `Excel: ${excelUrl}`,
    `PDF: ${pdfUrl}`
  ].join("\n");
}

function topGroups<T extends { line: WorkerLine; entry: JobEntry }>(lines: T[], nameFor: (line: T) => string) {
  const map = new Map<string, number>();
  for (const item of lines) {
    const name = nameFor(item);
    map.set(name, (map.get(name) ?? 0) + item.line.approvedHours);
  }
  return [...map.entries()]
    .map(([name, hours]) => ({ name, hours: sum([hours]) }))
    .sort((left, right) => right.hours - left.hours)
    .slice(0, 8);
}

function formatTime(value: string) {
  if (!value) return "";
  const [hourText, minuteText] = value.split(":");
  const hour = Number(hourText);
  const suffix = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${minuteText ?? "00"} ${suffix}`;
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

function sum(values: number[]) {
  return Math.round(values.reduce((total, value) => total + value, 0) * 100) / 100;
}
