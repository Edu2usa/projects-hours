export function calculateHours(startTime: string, finishTime: string) {
  if (!startTime || !finishTime) return 0;
  const [sh, sm] = startTime.split(":").map(Number);
  const [fh, fm] = finishTime.split(":").map(Number);
  const start = sh * 60 + sm;
  let finish = fh * 60 + fm;
  if (finish <= start) finish += 24 * 60;
  return roundDurationMinutes(finish - start);
}

export function roundDurationMinutes(totalMinutes: number) {
  if (!Number.isFinite(totalMinutes) || totalMinutes <= 0) return 0;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (minutes < 20) return hours;
  if (minutes < 40) return hours + 0.5;
  return hours + 1;
}

export function roundApprovedHours(hours: number) {
  if (!Number.isFinite(hours) || hours <= 0) return hours;
  return Math.round(hours * 2) / 2;
}

export function isWholeOrHalfHour(hours: number) {
  return Number.isFinite(hours) && hours > 0 && Math.abs(hours * 2 - Math.round(hours * 2)) < 0.001;
}

export function flagEntry(input: {
  rawAccountText?: string;
  rawServiceText?: string;
  workDate: string;
  manualOverride: boolean;
  hours: number;
}) {
  const flags: string[] = [];
  if (input.rawAccountText) flags.push("Other account needs cleanup");
  if (input.rawServiceText) flags.push("Other service needs cleanup");
  if (input.manualOverride) flags.push("Manual hour override");
  if (input.hours > 14) flags.push("Very long shift");
  const daysOld = (Date.now() - new Date(`${input.workDate}T00:00:00`).getTime()) / 86400000;
  if (daysOld > 7) flags.push("Backdated entry");
  return flags;
}
