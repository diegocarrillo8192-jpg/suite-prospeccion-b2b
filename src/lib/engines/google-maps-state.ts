const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

const SECURITY_PREFIX = ")]}'";

export interface MapsEntry {
  name: string;
  category: string;
  address: string;
  website: string;
  phone: string;
  rating: number | null;
  reviews: number | null;
  latitude: number | null;
  longitude: number | null;
  placeId: string;
  dataId: string;
  link: string;
}

export const MAPS_STATE_SCRIPT = `(function () {
  if (!window.APP_INITIALIZATION_STATE || !window.APP_INITIALIZATION_STATE[3]) return null;
  const appState = window.APP_INITIALIZATION_STATE[3];
  for (const key of Object.keys(appState)) {
    const arr = appState[key];
    if (Array.isArray(arr)) {
      for (const idx of [6, 5]) {
        const item = arr[idx];
        if (typeof item === "string" && item.startsWith(")]}'")) return item;
      }
    }
  }
  return null;
})()`;

function getNth(arr: unknown, ...indexes: number[]): unknown {
  let current: unknown = arr;
  for (const index of indexes) {
    if (!Array.isArray(current) || index < 0 || index >= current.length) return undefined;
    current = current[index];
  }
  return current;
}

function getString(arr: unknown, ...indexes: number[]): string {
  const value = getNth(arr, ...indexes);
  return typeof value === "string" ? value.trim() : "";
}

function getNumber(arr: unknown, ...indexes: number[]): number | null {
  const value = getNth(arr, ...indexes);
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function getArray(arr: unknown, ...indexes: number[]): unknown[] {
  const value = getNth(arr, ...indexes);
  return Array.isArray(value) ? value : [];
}

function toStringArray(value: unknown[]): string[] {
  const output: string[] = [];
  for (const item of value) {
    if (typeof item === "string" && item.trim()) output.push(item.trim());
    else if (typeof item === "number" && Number.isFinite(item)) output.push(String(item));
  }
  return output;
}

export function stripSecurityPrefix(raw: string): string {
  const value = (raw ?? "").trimStart();
  if (value.startsWith(SECURITY_PREFIX)) return value.slice(SECURITY_PREFIX.length).trim();
  return value.trim();
}

function removeFirstLine(body: string): string {
  const index = body.indexOf("\n");
  if (index === -1) return "";
  return body.slice(index + 1);
}

export function normalizeMapsUrl(raw: string): string {
  const value = (raw ?? "").trim();
  if (!value) return "";
  if (value.startsWith("/url?q=")) {
    try {
      const target = new URL(`https://www.google.com${value}`).searchParams.get("q");
      return target ?? value;
    } catch {
      return value;
    }
  }
  if (value.startsWith("/")) return `https://www.google.com${value}`;
  return value;
}

function entryFromPlaceState(data: unknown): MapsEntry | null {
  const darray = getNth(data, 6);
  if (!Array.isArray(darray)) return null;

  const name = getString(darray, 11);
  if (!name) return null;

  const categories = toStringArray(getArray(darray, 13));
  const rawAddress = getString(darray, 18);
  const prefix = `${name},`;
  const address = rawAddress.startsWith(prefix) ? rawAddress.slice(prefix.length).trim() : rawAddress;

  const websiteRaw = getString(darray, 7, 0);
  const phoneRaw = getString(darray, 178, 0, 0);
  const rating = getNumber(darray, 4, 7);
  const reviews = getNumber(darray, 4, 8);

  return {
    name,
    category: categories[0] ?? "",
    address,
    website: normalizeMapsUrl(websiteRaw),
    phone: phoneRaw.replace(/\s+/g, ""),
    rating,
    reviews: reviews === null ? null : Math.trunc(reviews),
    latitude: getNumber(darray, 9, 2),
    longitude: getNumber(darray, 9, 3),
    placeId: getString(darray, 78),
    dataId: getString(darray, 10),
    link: getString(darray, 27),
  };
}

export function parseMapsEntry(raw: string): MapsEntry | null {
  const text = stripSecurityPrefix(raw);
  if (!text) return null;
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  return entryFromPlaceState(data);
}

export function parseMapsSearchResults(body: string): MapsEntry[] {
  const cleaned = removeFirstLine(body).trim() || stripSecurityPrefix(body);
  if (!cleaned) return [];

  let data: unknown;
  try {
    data = JSON.parse(cleaned);
  } catch {
    return [];
  }

  const container = getNth(data, 0);
  const items = getNth(container, 1);
  if (!Array.isArray(items) || items.length < 2) return [];

  const entries: MapsEntry[] = [];
  for (let i = 1; i < items.length; i++) {
    const business = getNth(items[i], 14);
    if (!Array.isArray(business)) continue;

    const name = getString(business, 11);
    if (!name) continue;

    const categories = toStringArray(getArray(business, 13));
    const address = toStringArray(getArray(business, 2)).join(", ");
    const websiteRaw = getString(business, 7, 0);
    const phoneRaw = getString(business, 178, 0, 0);
    const reviews = getNumber(business, 4, 8);
    const dataId = getString(business, 10);

    entries.push({
      name,
      category: categories[0] ?? "",
      address,
      website: normalizeMapsUrl(websiteRaw),
      phone: phoneRaw.replace(/\s+/g, ""),
      rating: getNumber(business, 4, 7),
      reviews: reviews === null ? null : Math.trunc(reviews),
      latitude: getNumber(business, 9, 2),
      longitude: getNumber(business, 9, 3),
      placeId: "",
      dataId,
      link: dataId ? `https://www.google.com/maps/place/?q=place_id:${dataId}` : "",
    });
  }

  return entries;
}

export function parseMapsState(raw: string): MapsEntry[] {
  const entry = parseMapsEntry(raw);
  if (entry) return [entry];
  return parseMapsSearchResults(raw);
}

export function buildMapsPb(lon: number, lat: number, zoom: number): string {
  return (
    `!4m12!1m3!1d3826.902183192154!2d${lon.toFixed(4)}!3d${lat.toFixed(4)}!2m3` +
    `!1f0!2f0!3f0!3m2!1i600!2i800!4f${zoom.toFixed(1)}!7i20!8i0!10b1` +
    `!12m22!1m3!18b1!30b1!34e1!2m3!5m1!6e2!20e3!4b0!10b1!12b1!13b1!16b1` +
    `!17m1!3e1!20m3!5e2!6b1!14b1!46m1!1b0!96b1!19m4!2m3!1i360!2i120!4i8`
  );
}

export function buildMapsSearchUrl(
  query: string,
  location?: { latitude: number; longitude: number; zoom?: number }
): string {
  const q = encodeURIComponent(query.trim());
  if (!location) return `https://maps.google.com/search?tbm=map&authuser=0&hl=es&q=${q}`;
  const pb = buildMapsPb(location.longitude, location.latitude, location.zoom ?? 14);
  return `https://maps.google.com/search?tbm=map&authuser=0&hl=es&q=${q}&pb=${encodeURIComponent(pb)}`;
}

export function buildMapsBrowseUrl(
  query: string,
  location?: { latitude: number; longitude: number; zoom?: number }
): string {
  const q = encodeURIComponent(query.trim());
  if (location && location.latitude && location.longitude) {
    return `https://www.google.com/maps/search/${q}/@${location.latitude},${location.longitude},${
      location.zoom ?? 14
    }z?hl=es`;
  }
  return `https://www.google.com/maps/search/${q}?hl=es`;
}

export async function fetchMapsSearch(
  query: string,
  location: { latitude: number; longitude: number; zoom?: number },
  signal?: AbortSignal
): Promise<string> {
  const url = buildMapsSearchUrl(query, location);
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": BROWSER_UA,
        Accept: "application/json,text/plain,*/*",
        "Accept-Language": "es-ES,es;q=0.9,en;q=0.8",
      },
      redirect: "follow",
      signal: signal ?? AbortSignal.timeout(15000),
    });
    if (!response.ok) return "";
    return await response.text();
  } catch {
    return "";
  }
}
