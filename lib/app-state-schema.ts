import { z } from "zod";

// Validation for state written through the API routes. Objects use passthrough()
// so fields added by newer clients survive a round-trip through an older server,
// and optional fields accept null because legacy JSON stored in Supabase may use it.

const languageSchema = z.enum(["en", "es", "pt"]);
const roleSchema = z.enum(["worker", "crew_lead", "admin"]);
const entryStatusSchema = z.enum(["approved", "flagged", "needs_review"]);

const employeeSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  username: z.string().nullish(),
  role: roleSchema,
  active: z.boolean(),
  preferredLanguage: languageSchema.nullish()
}).passthrough();

const accountSchema = z.object({
  id: z.string().min(1),
  canonicalName: z.string().min(1),
  active: z.boolean(),
  isFavorite: z.boolean()
}).passthrough();

const serviceSchema = z.object({
  id: z.string().min(1),
  canonicalKey: z.string().min(1),
  label: z.object({ en: z.string(), es: z.string(), pt: z.string() }).passthrough(),
  active: z.boolean(),
  isCommon: z.boolean()
}).passthrough();

const workerLineSchema = z.object({
  id: z.string().min(1),
  employeeId: z.string().min(1),
  startTime: z.string(),
  finishTime: z.string(),
  calculatedHours: z.number(),
  approvedHours: z.number(),
  manualOverride: z.boolean(),
  overrideReason: z.string().nullish(),
  paySplits: z.object({ REG: z.number(), OT: z.number(), DT: z.number() }).passthrough()
}).passthrough();

export const jobEntrySchema = z.object({
  id: z.string().min(1),
  submittedByEmployeeId: z.string().min(1),
  accountId: z.string().nullish(),
  rawAccountText: z.string().nullish(),
  workDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "workDate must be YYYY-MM-DD"),
  defaultStartTime: z.string(),
  defaultFinishTime: z.string(),
  defaultCalculatedHours: z.number(),
  serviceIds: z.array(z.string()),
  rawServiceText: z.string().nullish(),
  notes: z.string().nullish(),
  gpsLat: z.number().nullish(),
  gpsLng: z.number().nullish(),
  status: entryStatusSchema,
  flags: z.array(z.string()),
  workerLines: z.array(workerLineSchema).min(1),
  createdAt: z.string()
}).passthrough();

export const appStateSchema = z.object({
  version: z.number(),
  accounts: z.array(accountSchema),
  employees: z.array(employeeSchema),
  services: z.array(serviceSchema),
  entries: z.array(jobEntrySchema)
}).passthrough();

export function describeZodError(error: z.ZodError) {
  return error.issues
    .slice(0, 5)
    .map((issue) => `${issue.path.join(".") || "state"}: ${issue.message}`)
    .join("; ");
}
