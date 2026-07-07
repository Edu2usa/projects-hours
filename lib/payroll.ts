// Biweekly payroll periods, 14 days long, ending every other Friday.
// Anchor: the payroll that closed with week 1 ending 2026-06-26 and week 2
// ending 2026-07-03. Hours dated 2026-07-04 or later fall in the next payroll
// (2026-07-04 to 2026-07-17), and so on every two weeks.
// "Today" is evaluated in the business time zone so a Friday-night submission
// near midnight UTC does not flip into the wrong period.

const anchorPeriodEnd = "2026-07-03";
const periodDays = 14;
const dayMs = 86_400_000;
const businessTimeZone = "America/New_York";

export type PayrollPeriod = {
  start: string;
  end: string;
  week1End: string;
  week2End: string;
  label: string;
};

export function payrollPeriodFor(date: string): PayrollPeriod {
  const anchor = toUtcMs(anchorPeriodEnd);
  const target = toUtcMs(date);
  const daysAfterAnchor = Math.round((target - anchor) / dayMs);
  const cycles = Math.ceil(daysAfterAnchor / periodDays);
  const end = anchor + cycles * periodDays * dayMs;
  const start = end - (periodDays - 1) * dayMs;
  const week1End = start + 6 * dayMs;
  return {
    start: toIsoDate(start),
    end: toIsoDate(end),
    week1End: toIsoDate(week1End),
    week2End: toIsoDate(end),
    label: `${formatDisplayDate(toIsoDate(start))} to ${formatDisplayDate(toIsoDate(end))}`
  };
}

export function currentPayrollPeriod(now = new Date()) {
  return payrollPeriodFor(businessToday(now));
}

export function previousPayrollPeriod(period: PayrollPeriod) {
  return payrollPeriodFor(toIsoDate(toUtcMs(period.start) - dayMs));
}

// The payroll period containing the most recent Friday. On the Monday after a
// period closes this is the closed period (ready to pay); mid-period it is the
// running period with week 1 complete.
export function latestFridayPayrollPeriod(now = new Date()) {
  const today = businessToday(now);
  let ms = toUtcMs(today);
  while (new Date(ms).getUTCDay() !== 5) ms -= dayMs;
  const friday = toIsoDate(ms);
  const period = payrollPeriodFor(friday);
  return { period, closed: period.end === friday };
}

export function isInPeriod(workDate: string, period: PayrollPeriod) {
  return workDate >= period.start && workDate <= period.end;
}

// ?period= values: "current" (default), "previous", "all" (no filter -> null),
// or any YYYY-MM-DD date inside the desired period.
export function resolvePeriodParam(param: string | null, now = new Date()): PayrollPeriod | null {
  if (!param || param === "current") return currentPayrollPeriod(now);
  if (param === "previous" || param === "last") return previousPayrollPeriod(currentPayrollPeriod(now));
  if (param === "all") return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(param)) return payrollPeriodFor(param);
  return currentPayrollPeriod(now);
}

export function formatDisplayDate(value: string) {
  const [year, month, day] = value.split("-");
  return `${Number(month)}/${Number(day)}/${year}`;
}

function businessToday(now: Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: businessTimeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

function toUtcMs(date: string) {
  return Date.parse(`${date}T00:00:00Z`);
}

function toIsoDate(ms: number) {
  return new Date(ms).toISOString().slice(0, 10);
}
