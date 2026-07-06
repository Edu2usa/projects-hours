export type Screen = "quick" | "crew" | "recent" | "admin";

export type Draft = {
  accountId: string;
  rawAccountText: string;
  workDate: string;
  startTime: string;
  finishTime: string;
  serviceIds: string[];
  rawServiceText: string;
  overrideHours: string;
  overrideReason: string;
  notes: string;
};

export type AdminEditDraft = {
  accountId: string;
  rawAccountText: string;
  workDate: string;
  defaultStartTime: string;
  defaultFinishTime: string;
  serviceIds: string[];
  rawServiceText: string;
  notes: string;
  workerLines: Array<{
    id: string;
    employeeId: string;
    startTime: string;
    finishTime: string;
    approvedHours: string;
    overrideReason: string;
  }>;
};

export function createEmptyDraft(): Draft {
  return createDraft();
}

export function createCrewDraft(): Draft {
  return createDraft({ startTime: "17:00", finishTime: "21:00" });
}

export function createDraft(defaults: Partial<Draft> = {}): Draft {
  return {
    accountId: "",
    rawAccountText: "",
    workDate: new Date().toISOString().slice(0, 10),
    startTime: "",
    finishTime: "",
    serviceIds: [],
    rawServiceText: "",
    overrideHours: "",
    overrideReason: "",
    notes: "",
    ...defaults
  };
}
