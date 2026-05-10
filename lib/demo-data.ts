import type { Account, Employee, JobEntry, Service } from "./types";

export const employees: Employee[] = [
  { id: "ed", name: "Ed Oliveira", role: "admin", active: true, preferredLanguage: "en" },
  { id: "ramon", name: "Ramon", role: "crew_lead", active: true, preferredLanguage: "es" },
  { id: "maria", name: "Maria", role: "worker", active: true, preferredLanguage: "pt" },
  { id: "jose", name: "Jose", role: "worker", active: true, preferredLanguage: "es" }
];

export const accounts: Account[] = [
  { id: "100-mill-plain", canonicalName: "100 Mill Plain", active: true, isFavorite: false },
  { id: "170-164", canonicalName: "170 / 164", active: true, isFavorite: false },
  { id: "20-germantown", canonicalName: "20 Germantown", active: true, isFavorite: false },
  { id: "235-main", canonicalName: "235 Main", active: true, isFavorite: false },
  { id: "33-germantown", canonicalName: "33 Germantown", active: true, isFavorite: false },
  { id: "79-sand-pit", canonicalName: "79 Sand Pit", active: true, isFavorite: false },
  { id: "anns-place", canonicalName: "Ann's Place", active: true, isFavorite: false },
  { id: "belimo", canonicalName: "Belimo", active: true, isFavorite: true },
  { id: "branson", canonicalName: "Branson", active: true, isFavorite: false },
  { id: "bridport-surgical", canonicalName: "Bridport Surgical", active: true, isFavorite: false },
  { id: "ccats", canonicalName: "CCATS", active: true, isFavorite: false },
  { id: "comm-ctr", canonicalName: "Comm Ctr", active: true, isFavorite: false },
  { id: "davitta", canonicalName: "Davitta", active: true, isFavorite: false },
  { id: "derm-assoc", canonicalName: "Derm Assoc", active: true, isFavorite: false },
  { id: "dhmac", canonicalName: "DHMAC", active: true, isFavorite: false },
  { id: "dr-cigno", canonicalName: "Dr. Cigno", active: true, isFavorite: false },
  { id: "entegris", canonicalName: "Entegris", active: true, isFavorite: false },
  { id: "ethan-allen", canonicalName: "Ethan Allen", active: true, isFavorite: false },
  { id: "gl-ridgefield", canonicalName: "GL Ridgefield", active: true, isFavorite: false },
  { id: "gold-garage", canonicalName: "Gold Garage", active: true, isFavorite: false },
  { id: "immaculate", canonicalName: "Immaculate", active: true, isFavorite: false },
  { id: "mannkind", canonicalName: "MannKind", active: true, isFavorite: false },
  { id: "maplewood", canonicalName: "Maplewood", active: true, isFavorite: false },
  { id: "mitchell-wdbry", canonicalName: "Mitchell WDBRY", active: true, isFavorite: false },
  { id: "motion-pt", canonicalName: "Motion PT", active: true, isFavorite: false },
  { id: "newt-rehab", canonicalName: "Newt Rehab", active: true, isFavorite: false },
  { id: "northeast", canonicalName: "Northeast", active: true, isFavorite: false },
  { id: "ridgefield-diagnostic", canonicalName: "Ridgefield Diagnostic", active: true, isFavorite: false },
  { id: "resonetics", canonicalName: "Resonetics", active: true, isFavorite: true },
  { id: "sherman-school", canonicalName: "Sherman School", active: true, isFavorite: false },
  { id: "somers", canonicalName: "Somers", active: true, isFavorite: false },
  { id: "urology-assoc", canonicalName: "Urology Assoc", active: true, isFavorite: false },
  { id: "vna", canonicalName: "VNA", active: true, isFavorite: false },
  { id: "wilton-surg", canonicalName: "Wilton Surg", active: true, isFavorite: false }
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
