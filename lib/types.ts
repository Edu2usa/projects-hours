export type Language = "en" | "es" | "pt";
export type Role = "worker" | "crew_lead" | "admin";
export type PayType = "REG" | "OT" | "DT";
export type EntryStatus = "approved" | "flagged" | "needs_review";

export type Employee = {
  id: string;
  name: string;
  username?: string;
  role: Role;
  active: boolean;
  preferredLanguage?: Language;
};

export type Account = {
  id: string;
  canonicalName: string;
  active: boolean;
  isFavorite: boolean;
};

export type Service = {
  id: string;
  canonicalKey: string;
  label: Record<Language, string>;
  active: boolean;
  isCommon: boolean;
};

export type WorkerLine = {
  id: string;
  employeeId: string;
  startTime: string;
  finishTime: string;
  calculatedHours: number;
  approvedHours: number;
  manualOverride: boolean;
  overrideReason?: string;
  paySplits: Record<PayType, number>;
};

export type JobEntry = {
  id: string;
  submittedByEmployeeId: string;
  accountId?: string;
  rawAccountText?: string;
  workDate: string;
  defaultStartTime: string;
  defaultFinishTime: string;
  defaultCalculatedHours: number;
  serviceIds: string[];
  rawServiceText?: string;
  notes?: string;
  gpsLat?: number;
  gpsLng?: number;
  status: EntryStatus;
  flags: string[];
  workerLines: WorkerLine[];
  createdAt: string;
};

export type Session = {
  employeeId: string;
  role: Role;
  language: Language;
  admin: boolean;
  token: string;
};
