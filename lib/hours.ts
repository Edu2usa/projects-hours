export function calculateHours(startTime: string, finishTime: string) {
  if (!startTime || !finishTime) return 0;
  const [sh, sm] = startTime.split(":").map(Number);
  const [fh, fm] = finishTime.split(":").map(Number);
  const start = sh * 60 + sm;
  let finish = fh * 60 + fm;
  if (finish <= start) finish += 24 * 60;
  return Math.round(((finish - start) / 60) * 100) / 100;
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
