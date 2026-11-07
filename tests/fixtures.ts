import type { AppState } from "../lib/app-state";
import type { JobEntry } from "../lib/types";

export const entry: JobEntry = {
  id: "submission-1", submittedByEmployeeId: "worker-1", accountId: "site-1",
  workDate: "2026-11-07", defaultStartTime: "09:00", defaultFinishTime: "17:00",
  defaultCalculatedHours: 8, serviceIds: ["service-1"], notes: "Finished lobby",
  gpsLat: 42.123, gpsLng: -71.456, status: "approved", flags: [],
  workerLines: [{ id: "line-1", employeeId: "worker-1", startTime: "09:00", finishTime: "17:00",
    calculatedHours: 8, approvedHours: 8, manualOverride: false, paySplits: { REG: 8, OT: 0, DT: 0 } }],
  createdAt: "2026-11-07T17:00:00Z"
};
export const state: AppState = {
  version: 2,
  accounts: [{ id: "site-1", canonicalName: "Test Site", active: true, isFavorite: true }],
  employees: [
    { id: "worker-1", name: "Test Worker", role: "worker", active: true },
    { id: "unrelated", name: "Must Not Appear", role: "worker", active: true }
  ],
  services: [{ id: "service-1", canonicalKey: "clean", label: { en: "Cleaning", es: "Cleaning", pt: "Cleaning" }, active: true, isCommon: true }],
  entries: []
};
