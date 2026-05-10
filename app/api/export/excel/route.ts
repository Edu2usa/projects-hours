import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { accounts, demoEntries, employees, services } from "../../../../lib/demo-data";

export async function GET() {
  const rows = demoEntries.flatMap((entry) =>
    entry.workerLines.map((line) => ({
      Date: entry.workDate,
      "Submitted at": entry.createdAt,
      "Submitted by": employeeName(entry.submittedByEmployeeId),
      "Employee worked": employeeName(line.employeeId),
      "Account/site": accountName(entry.accountId, entry.rawAccountText),
      "Raw account": entry.rawAccountText ?? "",
      Services: entry.serviceIds.map(serviceName).join(", "),
      "Raw service": entry.rawServiceText ?? "",
      Start: line.startTime,
      Finish: line.finishTime,
      "Calculated hours": line.calculatedHours,
      "Approved hours": line.approvedHours,
      REG: line.paySplits.REG,
      OT: line.paySplits.OT,
      DT: line.paySplits.DT,
      Notes: entry.notes ?? "",
      Flags: entry.flags.join(", ")
    }))
  );

  const payroll = employees.map((employee) => {
    const lines = demoEntries.flatMap((entry) => entry.workerLines).filter((line) => line.employeeId === employee.id);
    return {
      Employee: employee.name,
      "REG hours": sum(lines.map((line) => line.paySplits.REG)),
      "OT hours": sum(lines.map((line) => line.paySplits.OT)),
      "DT hours": sum(lines.map((line) => line.paySplits.DT)),
      "Total hours": sum(lines.map((line) => line.approvedHours)),
      Notes: ""
    };
  });

  const clientServices = demoEntries.flatMap((entry) =>
    entry.serviceIds.map((serviceId) => ({
      "Account/site": accountName(entry.accountId, entry.rawAccountText),
      Service: serviceName(serviceId),
      "Total hours": sum(entry.workerLines.map((line) => line.approvedHours)),
      "Employee breakdown": entry.workerLines.map((line) => `${employeeName(line.employeeId)} ${line.approvedHours}`).join("; ")
    }))
  );

  const audit = demoEntries.flatMap((entry) =>
    entry.flags.map((flag) => ({
      "Entry ID": entry.id,
      "Flag type": flag,
      "Original value": entry.rawAccountText ?? entry.rawServiceText ?? "",
      "Corrected value": "",
      "Admin action": "",
      "Correction request note": "",
      "Override reason": entry.workerLines.map((line) => line.overrideReason ?? "").filter(Boolean).join("; "),
      Timestamp: entry.createdAt
    }))
  );

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Preferred Maintenance";
  workbook.created = new Date();
  addSheet(workbook, "Payroll Summary", payroll);
  addSheet(workbook, "Approved Entries", rows);
  addSheet(workbook, "Client + Service Summaries", clientServices);
  addSheet(workbook, "Audit Flags Corrections", audit.length ? audit : [{ "Entry ID": "", "Flag type": "No unresolved flags" }]);

  const buffer = await workbook.xlsx.writeBuffer();
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": "attachment; filename=preferred-maintenance-hours.xlsx"
    }
  });
}

function addSheet(workbook: ExcelJS.Workbook, name: string, rows: Record<string, string | number>[]) {
  const sheet = workbook.addWorksheet(name);
  const headers = Object.keys(rows[0] ?? { Empty: "" });
  sheet.columns = headers.map((header) => ({ header, key: header, width: Math.min(Math.max(header.length + 6, 16), 34) }));
  sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F4F46" } };
  rows.forEach((row) => sheet.addRow(row));
  sheet.views = [{ state: "frozen", ySplit: 1 }];
}

function sum(values: number[]) {
  return Math.round(values.reduce((total, value) => total + value, 0) * 100) / 100;
}

function employeeName(id: string) {
  return employees.find((employee) => employee.id === id)?.name ?? id;
}

function accountName(id?: string, raw?: string) {
  return raw || accounts.find((account) => account.id === id)?.canonicalName || "Unknown";
}

function serviceName(id: string) {
  return services.find((service) => service.id === id)?.label.en ?? id;
}
