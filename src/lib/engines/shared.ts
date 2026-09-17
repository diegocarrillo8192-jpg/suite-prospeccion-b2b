import { callingCodeFor } from "../country-codes";

export interface RawLead {
  name: string;
  website: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  category: string;
}

export function hashString(value: string): string {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

export function makeId(...parts: Array<string | number>): string {
  return `p-${hashString(parts.join("|"))}`;
}

export function normalizeWebsite(raw: string): string {
  if (!raw) return "";
  let value = raw.trim();
  if (!/^https?:\/\//i.test(value)) value = `https://${value}`;
  try {
    const url = new URL(value);
    if (!url.hostname.includes(".")) return "";
    return url.toString();
  } catch {
    return "";
  }
}

const PANAMA_CODE = "507";
const PANAMA_MOBILE = /^6\d{7}$/;
const PANAMA_FIXED = /^[234789]\d{6,7}$/;
const PANAMA_TOLL_FREE = /^1?800\d{7}$/;

export function isValidPanamaNational(national: string): boolean {
  if (!/^\d+$/.test(national)) return false;
  if (PANAMA_TOLL_FREE.test(national)) return false;
  return PANAMA_MOBILE.test(national) || PANAMA_FIXED.test(national);
}

function panamaDisplay(national: string): { display: string; digits: string } {
  return { display: `+${PANAMA_CODE} ${national}`, digits: `${PANAMA_CODE}${national}` };
}

function formatPanamaPhone(
  digits: string,
  explicitInternational: boolean
): { display: string; digits: string } {
  const empty = { display: "", digits: "" };
  if (explicitInternational) {
    if (!digits.startsWith(PANAMA_CODE)) return empty;
    const national = digits.slice(PANAMA_CODE.length);
    return isValidPanamaNational(national) ? panamaDisplay(national) : empty;
  }

  if (digits.startsWith(PANAMA_CODE)) {
    const national = digits.slice(PANAMA_CODE.length);
    if (isValidPanamaNational(national)) return panamaDisplay(national);
  }

  return isValidPanamaNational(digits) ? panamaDisplay(digits) : empty;
}

export function formatPhone(
  raw: string,
  countryCode: string
): { display: string; digits: string } {
  const value = (raw ?? "").trim();
  if (!value) return { display: "", digits: "" };
  const explicitInternational = value.startsWith("+") || value.startsWith("00");
  let digits = value.replace(/\D/g, "");
  if (!digits) return { display: "", digits: "" };
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (!digits) return { display: "", digits: "" };

  const target = (countryCode ?? "").trim().toUpperCase();
  if (target === "PA") return formatPanamaPhone(digits, explicitInternational);

  const callingCode = callingCodeFor(target);
  const explicitPlus = value.startsWith("+");

  if (!explicitPlus && callingCode && !digits.startsWith(callingCode) && digits.length <= 11) {
    digits = callingCode + digits;
  }

  const prefix = callingCode && digits.startsWith(callingCode) ? callingCode : "";
  const national = prefix ? digits.slice(prefix.length) : "";
  const display = national ? `+${prefix} ${national}` : `+${digits}`;
  return { display, digits };
}

export function buildQuery(niche: string, city: string): string {
  const n = niche.trim();
  const c = city.trim();
  if (n && c) return `${n} en ${c}`;
  return c || n;
}
