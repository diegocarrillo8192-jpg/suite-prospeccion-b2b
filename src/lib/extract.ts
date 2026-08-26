import type { Prospect } from "./types";
import { callingCodeFor, countryNameFor } from "./country-codes";

const NOMINATIM_BASE = "https://nominatim.openstreetmap.org";
const OVERPASS_BASE = "https://overpass-api.de/api/interpreter";
const USER_AGENT = "SuiteProspeccionB2B/1.0 (contacto: diegocarrillo8192@gmail.com)";
const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

export interface ExtractionMeta {
  source: string;
  countryCode: string;
  countryName: string;
  cityName: string;
}

interface GeoLocation {
  lat: number;
  lon: number;
  south: number;
  north: number;
  west: number;
  east: number;
  countryCode: string;
  countryName: string;
  cityName: string;
}

interface RawBusiness {
  name: string;
  street: string;
  city: string;
  countryCode: string;
  email: string;
  phone: string;
  website: string;
}

interface NominatimResult {
  lat: string;
  lon: string;
  boundingbox?: string[];
  address?: Record<string, string>;
  extratags?: Record<string, string>;
  name?: string;
  display_name?: string;
}

interface OverpassElement {
  tags?: Record<string, string>;
}

interface OverpassResponse {
  elements?: OverpassElement[];
}

interface GooglePlacesResponse {
  results?: Array<{ name: string }>;
}

function hashString(s: string): string {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

function cleanDigits(v: string): string {
  return (v ?? "").replace(/\D/g, "");
}

function normKey(v: string): string {
  return v.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
}

function normalizeWebsite(raw: string): string {
  if (!raw) return "";
  let w = raw.trim();
  if (!/^https?:\/\//i.test(w)) w = `https://${w}`;
  try {
    const u = new URL(w);
    if (!u.hostname.includes(".")) return "";
    return u.toString();
  } catch {
    return "";
  }
}

function pickFirst(obj: Record<string, string> | undefined, keys: string[]): string {
  if (!obj) return "";
  for (const k of keys) {
    const v = obj[k];
    if (v && typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
}

const IMAGE_EXT = /\.(png|jpe?g|gif|svg|webp|ico|avif)([?#].*)?$/i;
const BAD_EMAIL_HINTS = /(example|domain|yourname|youremail|sentry|wixpress|email\.com|no-?reply@)/i;

function findEmails(html: string): string[] {
  const decoded = html
    .replace(/&#x40;|&#64;|%40/gi, "@")
    .replace(/&#46;/gi, ".")
    .replace(/&amp;/gi, "&");
  const re = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;
  const found: string[] = [];
  for (const m of decoded.match(re) ?? []) {
    const e = m.toLowerCase();
    if (IMAGE_EXT.test(e)) continue;
    if (BAD_EMAIL_HINTS.test(e)) continue;
    if (e.length > 120) continue;
    if (!found.includes(e)) found.push(e);
  }
  return found;
}

function pickBestEmail(emails: string[]): string {
  if (emails.length === 0) return "";
  const preferred = ["contacto", "contact", "info", "ventas", "hola", "admin", "hello"];
  for (const p of preferred) {
    const hit = emails.find((e) => e.startsWith(p));
    if (hit) return hit;
  }
  return emails[0];
}

function findPhone(html: string): string {
  const telLinks: string[] = [];
  const telRe = /(?:href|content)=["']?tel:([+\d][\d\s().-]{5,}[\d])/gi;
  for (const m of html.matchAll(telRe)) telLinks.push(m[1]);
  const generic: string[] = [];
  const genRe = /(?:\+?\d{1,3}[\s.-]?)?(?:\(?\d{2,4}\)?[\s.-]?){2,}\d{2,}/g;
  for (const m of html.match(genRe) ?? []) generic.push(m);

  for (const cand of [...telLinks, ...generic]) {
    const d = cleanDigits(cand);
    if (d.length >= 7 && d.length <= 15) return d;
  }
  return "";
}

async function scrapeContact(url: string): Promise<{ email: string; phone: string }> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": BROWSER_UA,
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "es",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return { email: "", phone: "" };
    const ct = res.headers.get("content-type") ?? "";
    if (!ct.includes("html") && !ct.includes("text")) return { email: "", phone: "" };
    const html = (await res.text()).slice(0, 1_000_000);
    const email = pickBestEmail(findEmails(html));
    const phone = findPhone(html);
    return { email, phone };
  } catch {
    return { email: "", phone: "" };
  }
}

async function fetchJson(url: string, headers: Record<string, string>): Promise<unknown> {
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function geocodeCity(city: string): Promise<GeoLocation> {
  const url = `${NOMINATIM_BASE}/search?format=jsonv2&limit=1&addressdetails=1&accept-language=es&q=${encodeURIComponent(city)}`;
  const data = (await fetchJson(url, { "User-Agent": USER_AGENT, "Accept-Language": "es" })) as NominatimResult[];
  const first = data?.[0];
  if (!first) throw new Error("city_not_found");
  const bb = first.boundingbox as string[] | undefined;
  const addr = (first.address ?? {}) as Record<string, string>;
  return {
    lat: Number(first.lat),
    lon: Number(first.lon),
    south: Number(bb?.[0]),
    north: Number(bb?.[1]),
    west: Number(bb?.[2]),
    east: Number(bb?.[3]),
    countryCode: (addr.country_code ?? "").toUpperCase(),
    countryName: addr.country ?? "",
    cityName:
      addr.city ?? addr.town ?? addr.village ?? addr.municipality ?? addr.state ?? city,
  };
}

function toRawBusiness(item: NominatimResult, fallbackCountryCode: string): RawBusiness | null {
  const extratags = (item.extratags ?? {}) as Record<string, string>;
  const address = (item.address ?? {}) as Record<string, string>;
  const name =
    (typeof item.name === "string" && item.name.trim()) ||
    String(item.display_name ?? "").split(",")[0]?.trim() ||
    "";

  if (!name) return null;
  if (name.length > 120) return null;

  const website = normalizeWebsite(
    pickFirst(extratags, ["website", "contact:website", "url", "contact:url", "website:url"])
  );
  const email = pickFirst(extratags, ["email", "contact:email"]).toLowerCase();
  const phone = cleanDigits(pickFirst(extratags, ["phone", "contact:phone", "contact:mobile"]));

  const street = [address.road, address.house_number].filter(Boolean).join(" ");
  const city = address.city ?? address.town ?? address.village ?? address.municipality ?? "";
  const countryCode = (address.country_code ?? fallbackCountryCode).toUpperCase();

  return { name, street, city, countryCode, email, phone, website };
}

async function searchNominatim(niche: string, city: string, limit: number): Promise<RawBusiness[]> {
  const q = `${niche} en ${city}`;
  const url = `${NOMINATIM_BASE}/search?format=jsonv2&addressdetails=1&extratags=1&accept-language=es&limit=${limit}&q=${encodeURIComponent(q)}`;
  const data = (await fetchJson(url, { "User-Agent": USER_AGENT, "Accept-Language": "es" })) as NominatimResult[];
  return (data ?? [])
    .map((d) => toRawBusiness(d, ""))
    .filter((b): b is RawBusiness => b !== null);
}

const NICHE_TO_OSM: Record<string, Array<[string, string]>> = {
  restaurante: [["amenity", "restaurant"], ["amenity", "fast_food"], ["amenity", "cafe"], ["amenity", "food_court"]],
  restaurantes: [["amenity", "restaurant"], ["amenity", "fast_food"], ["amenity", "cafe"], ["amenity", "food_court"]],
  comida: [["amenity", "restaurant"], ["amenity", "fast_food"], ["amenity", "cafe"]],
  gastronomia: [["amenity", "restaurant"], ["amenity", "cafe"], ["amenity", "bar"]],
  cafe: [["amenity", "cafe"]],
  bar: [["amenity", "bar"], ["amenity", "pub"]],
  hotel: [["tourism", "hotel"], ["tourism", "motel"], ["tourism", "guest_house"], ["tourism", "hostel"]],
  hoteles: [["tourism", "hotel"], ["tourism", "motel"], ["tourism", "guest_house"], ["tourism", "hostel"]],
  hospedaje: [["tourism", "hotel"], ["tourism", "guest_house"], ["tourism", "hostel"], ["tourism", "motel"]],
  alojamiento: [["tourism", "hotel"], ["tourism", "guest_house"], ["tourism", "hostel"]],
  farmacia: [["amenity", "pharmacy"]],
  farmacias: [["amenity", "pharmacy"]],
  clinica: [["amenity", "clinic"], ["amenity", "hospital"], ["amenity", "doctors"]],
  clinicas: [["amenity", "clinic"], ["amenity", "hospital"], ["amenity", "doctors"]],
  salud: [["amenity", "clinic"], ["amenity", "hospital"], ["amenity", "doctors"], ["amenity", "dentist"]],
  medico: [["amenity", "doctors"], ["amenity", "clinic"]],
  medicos: [["amenity", "doctors"], ["amenity", "clinic"]],
  hospital: [["amenity", "hospital"]],
  hospitales: [["amenity", "hospital"]],
  dental: [["amenity", "dentist"]],
  dentista: [["amenity", "dentist"]],
  abogado: [["office", "lawyer"], ["office", "notary"]],
  abogados: [["office", "lawyer"], ["office", "notary"]],
  legal: [["office", "lawyer"], ["office", "notary"]],
  gimnasio: [["leisure", "fitness_centre"], ["leisure", "sports_centre"]],
  gimnasios: [["leisure", "fitness_centre"], ["leisure", "sports_centre"]],
  fitness: [["leisure", "fitness_centre"]],
  supermercado: [["shop", "supermarket"], ["shop", "convenience"]],
  supermercados: [["shop", "supermarket"], ["shop", "convenience"]],
  peluqueria: [["shop", "hairdresser"], ["shop", "beauty"]],
  barberia: [["shop", "hairdresser"], ["shop", "beauty"]],
  banco: [["amenity", "bank"]],
  bancos: [["amenity", "bank"]],
  gasolinera: [["amenity", "fuel"]],
  taller: [["shop", "car_repair"], ["amenity", "vehicle_repair"]],
  mecanico: [["shop", "car_repair"]],
  escuela: [["amenity", "school"], ["amenity", "kindergarten"]],
  colegio: [["amenity", "school"]],
  educacion: [["amenity", "school"], ["amenity", "university"], ["amenity", "college"], ["amenity", "kindergarten"]],
  iglesia: [["amenity", "place_of_worship"]],
  veterinaria: [["amenity", "veterinary"]],
  inmobiliaria: [["office", "estate_agent"]],
};

function nicheToOsmTags(niche: string): Array<[string, string]> | null {
  const key = normKey(niche);
  return NICHE_TO_OSM[key] ?? null;
}

async function searchOverpass(
  geo: GeoLocation,
  niche: string,
  limit: number
): Promise<RawBusiness[]> {
  const tags = nicheToOsmTags(niche);
  const token = normKey(niche).slice(0, 30) || "business";
  const parts: string[] = [];

  if (tags) {
    for (const [k, v] of tags) {
      parts.push(`node["${k}"="${v}"](${geo.south},${geo.west},${geo.north},${geo.east});`);
    }
  }
  parts.push(`node["name"~"${token}",i](${geo.south},${geo.west},${geo.north},${geo.east});`);

  const query = `[out:json][timeout:25];(${parts.join("")});out center ${limit * 2};`;
  const res = await fetch(OVERPASS_BASE, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `data=${encodeURIComponent(query)}`,
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) return [];
  const data = (await res.json()) as OverpassResponse;

  return (data.elements ?? [])
    .map((el) => {
      const t = (el.tags ?? {}) as Record<string, string>;
      const name = t.name ?? "";
      if (!name) return null;
      const website = normalizeWebsite(
        pickFirst(t, ["website", "contact:website", "url", "contact:url"])
      );
      const email = (t["email"] ?? t["contact:email"] ?? "").toLowerCase();
      const phone = cleanDigits(t["phone"] ?? t["contact:phone"] ?? t["contact:mobile"] ?? "");
      const street = [t["addr:street"], t["addr:housenumber"]].filter(Boolean).join(" ");
      const city = t["addr:city"] ?? geo.cityName;
      return {
        name,
        street,
        city,
        countryCode: geo.countryCode,
        email,
        phone,
        website,
      } as RawBusiness;
    })
    .filter((b): b is RawBusiness => b !== null);
}

async function searchGooglePlaces(
  niche: string,
  geo: GeoLocation,
  limit: number
): Promise<RawBusiness[]> {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) return [];

  const query = `${niche} in ${geo.cityName}`;
  const url = new URL("https://maps.googleapis.com/maps/api/place/textsearch/json");
  url.searchParams.set("query", query);
  url.searchParams.set("key", key);
  url.searchParams.set("language", "es");
  url.searchParams.set("location", `${geo.lat},${geo.lon}`);
  url.searchParams.set("radius", "25000");

  const data = (await fetchJson(url.toString(), {})) as GooglePlacesResponse;
  return (data.results ?? []).slice(0, limit).map((r) => ({
    name: r.name,
    street: "",
    city: geo.cityName,
    countryCode: geo.countryCode,
    email: "",
    phone: "",
    website: "",
  }));
}

function dedupRaw(list: RawBusiness[]): RawBusiness[] {
  const seen = new Set<string>();
  const out: RawBusiness[] = [];
  for (const b of list) {
    const key = normKey(b.name) || b.website;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(b);
  }
  return out;
}

async function mapConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let idx = 0;
  async function worker() {
    while (idx < items.length) {
      const i = idx++;
      results[i] = await fn(items[i]);
    }
  }
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker);
  await Promise.all(workers);
  return results;
}

function toInternationalPhone(rawDigits: string, countryCode: string): string {
  const cc = callingCodeFor(countryCode);
  if (!cc || !rawDigits) return "";
  let d = rawDigits;
  if (d.startsWith("00")) d = d.slice(2);
  if (d.startsWith(cc)) return d;
  return cc + d;
}

function displayPhone(digits: string, countryCode: string): string {
  const cc = callingCodeFor(countryCode);
  const national = cc && digits.startsWith(cc) ? digits.slice(cc.length) : digits;
  return `+${cc} ${national}`.trim();
}

export async function extractProspects(
  niche: string,
  city: string,
  limit: number
): Promise<{ prospects: Prospect[]; meta: ExtractionMeta }> {
  const geo = await geocodeCity(city);

  const sources: string[] = [];
  let candidates: RawBusiness[] = [];

  const nominatim = await searchNominatim(niche, city, Math.max(limit * 2, 20));
  if (nominatim.length) {
    sources.push("OpenStreetMap");
    candidates = nominatim;
  }

  if (candidates.length < limit) {
    const overpass = await searchOverpass(geo, niche, limit);
    if (overpass.length) {
      sources.push("Overpass");
      candidates = dedupRaw([...candidates, ...overpass]);
    }
  }

  if (candidates.length < limit && process.env.GOOGLE_PLACES_API_KEY) {
    const gp = await searchGooglePlaces(niche, geo, limit);
    if (gp.length) {
      sources.push("Google Places");
      candidates = dedupRaw([...candidates, ...gp]);
    }
  }

  candidates = dedupRaw(candidates).slice(0, limit);

  const enriched = await mapConcurrency(candidates, 8, async (b) => {
    let email = b.email;
    let phone = b.phone;
    if (b.website && (!email || !phone)) {
      const scraped = await scrapeContact(b.website);
      if (!email) email = scraped.email;
      if (!phone) phone = scraped.phone;
    }
    return { ...b, email, phone };
  });

  const prospects: Prospect[] = enriched.map((b, i) => {
    const intl = toInternationalPhone(b.phone, b.countryCode || geo.countryCode);
    const direction = [b.street, b.city || geo.cityName, geo.countryName].filter(Boolean).join(", ");
    return {
      id: `p-${hashString(`${b.name}|${b.website}|${i}`)}`,
      nombre: "",
      empresa: b.name,
      correo: b.email || "No disponible",
      telefono: intl ? displayPhone(intl, b.countryCode || geo.countryCode) : "No disponible",
      whatsapp: intl,
      direccion: direction,
      website: b.website,
      ciudad: b.city || geo.cityName,
      rubro: niche.trim(),
    };
  });

  return {
    prospects,
    meta: {
      source: sources.join(" + ") || "OpenStreetMap",
      countryCode: geo.countryCode,
      countryName: countryNameFor(geo.countryCode, geo.countryName),
      cityName: geo.cityName,
    },
  };
}
