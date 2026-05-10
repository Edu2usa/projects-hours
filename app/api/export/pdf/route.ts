import { NextResponse } from "next/server";
import { jsPDF } from "jspdf";
import { loadServerAppState } from "../../../../lib/server-state";
import type { Account, Service } from "../../../../lib/types";

export async function GET() {
  const { state } = await loadServerAppState();
  const { accounts, employees, entries, services } = state;
  const doc = new jsPDF();
  doc.setFillColor(31, 79, 70);
  doc.rect(0, 0, 210, 28, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(18);
  doc.text("Preferred Maintenance", 14, 13);
  doc.setFontSize(12);
  doc.text("Special Project Hours Management Report", 14, 21);

  doc.setTextColor(23, 32, 29);
  doc.setFontSize(11);
  let y = 40;
  const totalHours = entries.flatMap((entry) => entry.workerLines).reduce((sum, line) => sum + line.approvedHours, 0);
  doc.text(`Date range: Current preview period`, 14, y);
  y += 8;
  doc.text(`Total hours: ${totalHours.toFixed(1)}`, 14, y);
  y += 12;

  y = section(doc, "Employee totals", y);
  for (const employee of employees) {
    const hours = entries.flatMap((entry) => entry.workerLines).filter((line) => line.employeeId === employee.id).reduce((sum, line) => sum + line.approvedHours, 0);
    if (hours > 0) y = line(doc, `${employee.name}: ${hours.toFixed(1)} hours`, y);
  }

  y = section(doc, "Client/site totals", y + 5);
  for (const entry of entries) {
    y = line(doc, `${accountName(accounts, entry.accountId, entry.rawAccountText)}: ${entry.workerLines.reduce((sum, item) => sum + item.approvedHours, 0).toFixed(1)} hours`, y);
  }

  y = section(doc, "Service totals", y + 5);
  for (const entry of entries) {
    y = line(doc, entry.serviceIds.map((serviceId) => serviceName(services, serviceId)).join(", "), y);
  }

  y = section(doc, "Flags and corrections", y + 5);
  const flags = entries.flatMap((entry) => entry.flags);
  y = line(doc, flags.length ? flags.join(", ") : "No unresolved flags in preview data.", y);

  const buffer = Buffer.from(doc.output("arraybuffer"));
  return new NextResponse(buffer, {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": "attachment; filename=preferred-maintenance-hours-report.pdf"
    }
  });
}

function section(doc: jsPDF, title: string, y: number) {
  doc.setFontSize(13);
  doc.setTextColor(31, 79, 70);
  doc.text(title, 14, y);
  return y + 8;
}

function line(doc: jsPDF, text: string, y: number) {
  doc.setFontSize(10);
  doc.setTextColor(23, 32, 29);
  doc.text(text.slice(0, 100), 18, y);
  return y + 7;
}

function accountName(accounts: Account[], id?: string, raw?: string) {
  return raw || accounts.find((account) => account.id === id)?.canonicalName || "Unknown";
}

function serviceName(services: Service[], id: string) {
  return services.find((service) => service.id === id)?.label.en ?? id;
}
