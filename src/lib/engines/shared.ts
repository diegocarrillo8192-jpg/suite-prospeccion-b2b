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

export function formatPhone(
  raw: string,
  countryCode: string
): { display: string; digits: string } {
  const value = (raw ?? "").trim();
  if (!value) return { display: "", digits: "" };
  let digits = value.replace(/\D/g, "");
  if (!digits) return { display: "", digits: "" };
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (!digits) return { display: "", digits: "" };

  const callingCode = callingCodeFor(countryCode);
  const explicitInternational = value.startsWith("+");

  if (!explicitInternational && callingCode && !digits.startsWith(callingCode) && digits.length <= 11) {
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
