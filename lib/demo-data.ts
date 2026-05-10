import type { Account, Employee, JobEntry, Service } from "./types";

export const employees: Employee[] = [
  { id: "ed", name: "Ed Oliveira", role: "admin", active: true, preferredLanguage: "en" },
  { id: "ramon", name: "Ramon", role: "crew_lead", active: true, preferredLanguage: "es" },
  { id: "maria", name: "Maria", role: "worker", active: true, preferredLanguage: "pt" },
  { id: "jose", name: "Jose", role: "worker", active: true, preferredLanguage: "es" }
];

export const accounts: Account[] = [
  { id: "resonetics", canonicalName: "Resonetics", active: true, isFavorite: true },
  { id: "labcorp", canonicalName: "Labcorp", active: true, isFavorite: true },
  { id: "move-out", canonicalName: "Move-out Projects", active: true, isFavorite: false },
  { id: "construction", canonicalName: "Construction Final Clean", active: true, isFavorite: false }
];

export const services: Service[] = [
  { id: "floor-cleaning", canonicalKey: "floor_cleaning", label: { en: "Floor cleaning", es: "Pisos", pt: "Pisos" }, active: true, isCommon: true },
  { id: "strip-wax", canonicalKey: "strip_wax", label: { en: "Strip/wax", es: "Decapado/encerado", pt: "Remover/encerar" }, active: true, isCommon: true },
  { id: "carpet", canonicalKey: "carpet_shampoo", label: { en: "Carpet shampoo", es: "Alfombras", pt: "Carpetes" }, active: true, isCommon: true },
  { id: "windows", canonicalKey: "windows_glass", label: { en: "Windows/glass", es: "Ventanas", pt: "Vidros" }, active: true, isCommon: true },
  { id: "bathrooms", canonicalKey: "bathrooms", label: { en: "Bathrooms", es: "Baños", pt: "Banheiros" }, active: true, isCommon: true },
  { id: "final-clean", canonicalKey: "final_construction_cleaning", label: { en: "Final construction cleaning", es: "Final de obra", pt: "Final de obra" }, active: true, isCommon: false },
  { id: "moving", canonicalKey: "moving_setup", label: { en: "Moving/setup", es: "Mudanza", pt: "Mudança" }, active: true, isCommon: false },
  { id: "dusting", canonicalKey: "dusting_high_dusting", label: { en: "Dusting/high dusting", es: "Polvo alto", pt: "Pó alto" }, active: true, isCommon: false },
  { id: "emergency", canonicalKey: "emergency_cleanup", label: { en: "Emergency cleanup", es: "Emergencia", pt: "Emergencia" }, active: true, isCommon: false }
];

export const demoEntries: JobEntry[] = [
  {
    id: "demo-1",
    submittedByEmployeeId: "ramon",
    accountId: "resonetics",
    workDate: new Date().toISOString().slice(0, 10),
    defaultStartTime: "17:00",
    defaultFinishTime: "01:00",
    defaultCalculatedHours: 8,
    serviceIds: ["floor-cleaning", "windows"],
    notes: "Night special project.",
    status: "approved",
    flags: [],
    workerLines: [
      {
        id: "line-1",
        employeeId: "ramon",
        startTime: "17:00",
        finishTime: "01:00",
        calculatedHours: 8,
        approvedHours: 8,
        manualOverride: false,
        paySplits: { REG: 8, OT: 0, DT: 0 }
      }
    ],
    createdAt: new Date().toISOString()
  }
];
