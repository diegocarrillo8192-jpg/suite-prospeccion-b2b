import type { Prospect } from "../types";
import type { GeoLocation } from "../extract";
import { buildQuery, formatPhone, makeId, normalizeWebsite } from "./shared";

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

const PLACE_ID = /^ChI[A-Za-z0-9_-]{8,}$/;
const HEX_ID = /^0x[0-9a-f]+:0x[0-9a-f]+$/i;
const URL_RE = /^https?:\/\//i;
const PHONE_RE = /^\+?[\d][\d\s().-]{6,}$/;
const NOISE_HOST = /google\.com|gstatic\.com|googleusercontent\.com|goo\.gl|ggpht\.com|schema\.org/i;

interface MapsPlace {
  name: string;
  phone: string;
  website: string;
  address: string;
}

async function fetchHtml(url: string): Promise<string> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": BROWSER_UA,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "es-ES,es;q=0.9,en;q=0.8",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) return "";
    return await res.text();
  } catch {
    return "";
  }
}

function extractInitializationState(html: string): unknown | null {
  const marker = "APP_INITIALIZATION_STATE=";
  const markerIndex = html.indexOf(marker);
  if (markerIndex === -1) return null;
  const start = html.indexOf("[", markerIndex);
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < html.length; i++) {
    const char = html[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === "[") depth++;
    else if (char === "]") {
      depth--;
      if (depth === 0) {
        const raw = html.slice(start, i + 1);
        if (raw.length > 12_000_000) return null;
        try {
          return JSON.parse(raw) as unknown;
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

function isPlaceId(value: string): boolean {
  return PLACE_ID.test(value) || HEX_ID.test(value);
}

function isPhone(value: string): boolean {
  if (!PHONE_RE.test(value)) return false;
  const digits = value.replace(/\D/g, "");
  return digits.length >= 7 && digits.length <= 15;
}

function isUrl(value: string): boolean {
  return URL_RE.test(value);
}

function isCoordinate(value: string): boolean {
  return /^-?\d{1,3}\.\d{3,},\s*-?\d{1,3}\.\d{3,}$/.test(value.trim());
}

function isName(value: string, cityName: string): boolean {
  const trimmed = value.trim();
  if (trimmed.length < 3 || trimmed.length > 120) return false;
  if (isUrl(trimmed) || isPlaceId(trimmed) || isPhone(trimmed) || isCoordinate(trimmed)) return false;
  if (NOISE_HOST.test(trimmed)) return false;
  if (/^[A-Z]:\\|^\/[a-z]|^www\./i.test(trimmed)) return false;
  if (!/[A-Za-zÀ-ÿ]/.test(trimmed)) return false;
  if (cityName && trimmed.toLowerCase() === cityName.toLowerCase()) return false;
  return true;
}

function parsePlace(strings: string[], cityName: string): MapsPlace | null {
  const values = strings.map((value) => value.trim()).filter(Boolean);
  const name = values.find((value) => isName(value, cityName));
  if (!name) return null;

  const phone = values.find((value) => isPhone(value)) ?? "";
  const website =
    values.find((value) => isUrl(value) && !NOISE_HOST.test(value)) ?? "";

  const address =
    values.find(
      (value) =>
        !isUrl(value) &&
        !isPhone(value) &&
        !isPlaceId(value) &&
        !isCoordinate(value) &&
        value.length > 8 &&
        value.length < 200 &&
        /\d/.test(value) &&
        (value.includes(",") || value.toLowerCase().includes(cityName.toLowerCase()))
    ) ?? "";

  if (!phone && !website) return null;

  return { name, phone, website, address };
}

function findPlaceArrays(
  root: unknown,
  cityName: string,
  out: MapsPlace[],
  limit: number
): void {
  const containsId = new WeakMap<object, boolean>();
  const collected = new WeakMap<object, string[]>();

  function hasId(node: unknown): boolean {
    if (typeof node === "string") return isPlaceId(node);
    if (!Array.isArray(node)) return false;
    const cached = containsId.get(node);
    if (cached !== undefined) return cached;
    let found = false;
    for (const child of node) {
      if (hasId(child)) {
        found = true;
        break;
      }
    }
    containsId.set(node, found);
    return found;
  }

  function stringsOf(node: unknown): string[] {
    if (!Array.isArray(node)) return [];
    const cached = collected.get(node);
    if (cached) return cached;
    const acc: string[] = [];
    for (const child of node) {
      if (typeof child === "string") {
        if (acc.length < 600) acc.push(child);
      } else if (Array.isArray(child)) {
        for (const nested of stringsOf(child)) {
          if (acc.length >= 600) break;
          acc.push(nested);
        }
      }
    }
    collected.set(node, acc);
    return acc;
  }

  function walk(node: unknown, depth: number): void {
    if (out.length >= limit || depth > 20) return;
    if (!Array.isArray(node) || !hasId(node)) return;

    const childWithId = node.find((child) => hasId(child));
    if (childWithId !== undefined) {
      walk(childWithId, depth + 1);
      for (const child of node) {
        if (child !== childWithId) walk(child, depth + 1);
      }
      return;
    }

    const place = parsePlace(stringsOf(node), cityName);
    if (place) out.push(place);
  }

  walk(root, 0);
}

export async function extractGoogleMapsPublic(
  geo: GeoLocation,
  niche: string,
  limit: number
): Promise<Prospect[]> {
  const query = buildQuery(niche.trim() || "negocios", geo.cityName);
  const url = `https://www.google.com/maps/search/${encodeURIComponent(query)}?hl=es`;
  const html = await fetchHtml(url);
  if (!html) return [];

  const state = extractInitializationState(html);
  if (!state) return [];

  const places: MapsPlace[] = [];
  findPlaceArrays(state, geo.cityName, places, Math.max(limit, 20));

  const seen = new Set<string>();
  const prospects: Prospect[] = [];

  for (const place of places) {
    const key = place.name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    const website = normalizeWebsite(place.website);
    const phone = place.phone ? formatPhone(place.phone, geo.countryCode) : { display: "", digits: "" };
    if (!phone.display && !website) continue;

    prospects.push({
      id: makeId(place.name, website, place.address, phone.digits),
      nombre: "",
      empresa: place.name,
      correo: "No disponible",
      telefono: phone.display || "No disponible",
      whatsapp: phone.digits,
      direccion: place.address || geo.cityName,
      website,
      ciudad: geo.cityName,
      rubro: niche.trim() || "negocios",
    });

    if (prospects.length >= limit) break;
  }

  return prospects;
}
