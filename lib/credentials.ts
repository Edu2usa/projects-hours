import "server-only";
import { randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { getSupabaseAdmin } from "./supabase-server";

export type EmployeeCredential = {
  employeeId: string;
  username: string;
  salt: string;
  pinHash: string;
};

const credentialsKey = "employee_credentials";

const seedEmployeeCredentials: EmployeeCredential[] = [
  { employeeId: "ed", username: "Ed", salt: "fa3a28e2eee15234ed4ac0ede6886632", pinHash: "d42c60ffb9c3a2f1821b56b6ba7047c16fb0a5a6903f3c0e0be9a9e7d9379f56" },
  { employeeId: "ventura", username: "Ventura", salt: "d811a18364da6e265dc380e08ad972c7", pinHash: "68d496bd318c59b05e0af47f927c9db61d2cd950cf797e6b44ed45c6d2341cb3" },
  { employeeId: "eusebio", username: "Eusebio", salt: "b82f02264b4e6bebfdb57e0518028332", pinHash: "f8b7f289631d6b7f34a812ceef47a1622ec056f80b29fe4cea9edff5e2b020a6" },
  { employeeId: "jara", username: "Jara", salt: "0e6a5e48f397d8d09cd5fab186528f97", pinHash: "8ecee5fa8b74be58f5748026bf511f69d013f0c8040c29a9f2128480a353d243" },
  { employeeId: "ramon", username: "Ramon", salt: "af489a27f0a606c0043be575a65cba4a", pinHash: "59d7de40da60fd8dae851d2c527e1bff1b299afb429fd820c049627257e4ef6e" },
  { employeeId: "henri", username: "Henri", salt: "560645b7827b174950b3cffe2413f14e", pinHash: "eea21c63700a3215031fb41f3e9a6787421ecc63f8f3ad386856b4be9a299f17" },
  { employeeId: "jr", username: "Jr", salt: "a093e8cdb6560b33a107749241aa49d3", pinHash: "74e9dd53fd4666bfd958daf22486a4e4800048561c2599ea332174bd95cb6588" },
  { employeeId: "delota", username: "Delota", salt: "81d9e773685b9f4a2d5134ac1a763a84", pinHash: "5379e3de9c778a894edbbbb729a6d560311f770df32eb9bd09997ec127e0fcc3" },
  { employeeId: "morfe", username: "Morfe", salt: "febb877341049af836bcd4bd9fe5780d", pinHash: "06f6b668a9fde883ebef993110a04a86c1975f7fc1d611c4176895699f7d84fd" },
  { employeeId: "ariel", username: "Ariel", salt: "61ab9d7540a06b53ea239e10c251a980", pinHash: "4d8d8eacbac2525bed884f69eb6a76ac060ba6622855645271feb5178f7f7c91" }
];

export function hashPin(pin: string, salt = randomBytes(16).toString("hex")) {
  return {
    salt,
    pinHash: scryptSync(pin, salt, 32).toString("hex")
  };
}

export function verifyPin(pin: string, credential: EmployeeCredential) {
  const entered = Buffer.from(scryptSync(pin, credential.salt, 32).toString("hex"), "hex");
  const stored = Buffer.from(credential.pinHash, "hex");
  return entered.length === stored.length && timingSafeEqual(entered, stored);
}

export async function loadEmployeeCredentials() {
  const supabase = getSupabaseAdmin();
  if (!supabase) return [];
  const result = await supabase
    .from("settings")
    .select("value_json")
    .eq("key", credentialsKey)
    .maybeSingle();
  if (result.error) throw result.error;
  const value = result.data?.value_json;
  return Array.isArray(value) && value.length ? value as EmployeeCredential[] : seedEmployeeCredentials;
}
