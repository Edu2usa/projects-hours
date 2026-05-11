import "server-only";
import { createHmac, timingSafeEqual } from "crypto";
import type { Language, Role } from "./types";

export type SessionClaims = {
  employeeId: string;
  role: Role;
  language: Language;
  admin: boolean;
  exp: number;
};

const oneWeekSeconds = 60 * 60 * 24 * 7;

export function createSessionToken(claims: Omit<SessionClaims, "exp">) {
  const payload: SessionClaims = {
    ...claims,
    exp: Math.floor(Date.now() / 1000) + oneWeekSeconds
  };
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = sign(encodedPayload);
  return `${encodedPayload}.${signature}`;
}

export function verifySessionToken(token: string | null | undefined) {
  if (!token) return null;
  const [encodedPayload, signature] = token.split(".");
  if (!encodedPayload || !signature) return null;
  const expected = sign(encodedPayload);
  if (!safeEqual(signature, expected)) return null;
  const claims = JSON.parse(base64UrlDecode(encodedPayload)) as SessionClaims;
  if (!claims.exp || claims.exp < Math.floor(Date.now() / 1000)) return null;
  return claims;
}

function sign(value: string) {
  return createHmac("sha256", getSecret()).update(value).digest("base64url");
}

function getSecret() {
  return process.env.SESSION_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "local-development-session-secret";
}

function base64UrlEncode(value: string) {
  return Buffer.from(value, "utf8").toString("base64url");
}

function base64UrlDecode(value: string) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}
