import type { EmailValidation, Prospect, SocialLinks } from "./types";
import { callingCodeFor, countryNameFor } from "./country-codes";
import { enrichProspect } from "./enricher";
import { isAllowedWebsite, isForeignTld } from "./engines/domains";
import { extractOverpass } from "./engines/overpass";
import { extractGoogleMapsPublic } from "./engines/google-maps";
import { planQueries } from "./engines/query";

const NOMINATIM_BASE = "https://nominatim.openstreetmap.org";
const USER_AGENT = "SuiteProspeccionB2B/1.0 (contacto: diegocarrillo8192@gmail.com)";
const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

export interface ExtractionMeta {
  source: string;
  countryCode: string;
  countryName: string;
  cityName: string;
}

export interface GeoLocation {
  countryCode: string;
  countryName: string;
  cityName: string;
  latitude: number;
  longitude: number;
}

interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

interface RawBusiness {
  name: string;
  website: string;
  snippet: string;
  city: string;
  countryCode: string;
  email: string;
  phone: string;
  emails: string[];
  social: SocialLinks;
  validation: EmailValidation | null;
}

interface NominatimResult {
  address?: Record<string, string>;
  lat?: string;
  lon?: string;
}

function hashString(s: string): string {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
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

function safeHost(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function isAllowedUrl(url: string): boolean {
  return isAllowedWebsite(url);
}

function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&aacute;/gi, "á")
    .replace(/&eacute;/gi, "é")
    .replace(/&iacute;/gi, "í")
    .replace(/&oacute;/gi, "ó")
    .replace(/&uacute;/gi, "ú")
    .replace(/&ntilde;/gi, "ñ")
    .replace(/&uuml;/gi, "ü")
    .replace(/&auml;/gi, "ä")
    .replace(/&ouml;/gi, "ö")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function stripTags(s: string): string {
  return decodeEntities(s.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
}

function cleanTitle(t: string): string {
  let s = t.trim();
  const m = /^([^|—–·»]+)/.exec(s);
  if (m) s = m[1].trim();
  s = s.replace(/\s*[-–—]\s*(inicio|home|contacto|contact|sitio oficial|página oficial|página web oficial)$/i, "");
  return s.slice(0, 80);
}

function cleanSnippet(s: string): string {
  return s.replace(/\s+/g, " ").trim().slice(0, 220);
}

function getQueryParam(url: string, key: string): string {
  try {
    return new URL(url).searchParams.get(key) ?? "";
  } catch {
    const m = new RegExp(`[?&]${key}=([^&]+)`).exec(url);
    return m ? m[1] : "";
  }
}

function safeDecode(v: string): string {
  try {
    return decodeURIComponent(v);
  } catch {
    return v;
  }
}

function decodeBingU(val: string): string | null {
  try {
    let v = val;
    if (v.startsWith("a1")) v = v.slice(2);
    const b64 = v.replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
    return Buffer.from(padded, "base64").toString("utf8");
  } catch {
    return null;
  }
}

function decodeSearchUrl(href: string): string {
  let h = href.trim();
  if (!h) return "";
  h = h.replace(/&amp;/g, "&").replace(/&#38;/g, "&");
  if (h.startsWith("//")) h = `https:${h}`;

  const uddg = getQueryParam(h, "uddg");
  if (uddg) {
    const d = safeDecode(uddg);
    if (/^https?:\/\//i.test(d)) return d;
  }

  const u = getQueryParam(h, "u");
  if (u) {
    const d = decodeBingU(u) ?? safeDecode(u);
    if (/^https?:\/\//i.test(d)) return d;
  }

  return h;
}

async function fetchJson(url: string, headers: Record<string, string>): Promise<unknown> {
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function geocodeCity(city: string): Promise<GeoLocation | null> {
  try {
    const url = `${NOMINATIM_BASE}/search?format=jsonv2&limit=1&addressdetails=1&accept-language=es&q=${encodeURIComponent(city)}`;
    const data = (await fetchJson(url, { "User-Agent": USER_AGENT, "Accept-Language": "es" })) as NominatimResult[];
    const first = data?.[0];
    if (!first) return null;
    const addr = (first.address ?? {}) as Record<string, string>;
    const latitude = Number(first.lat);
    const longitude = Number(first.lon);
    return {
      countryCode: (addr.country_code ?? "").toUpperCase(),
      countryName: addr.country ?? "",
      cityName: addr.city ?? addr.town ?? addr.village ?? addr.municipality ?? addr.state ?? city,
      latitude: Number.isFinite(latitude) ? latitude : 0,
      longitude: Number.isFinite(longitude) ? longitude : 0,
    };
  } catch {
    return null;
  }
}

async function fetchHtml(url: string, browser: boolean): Promise<string> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": browser ? BROWSER_UA : USER_AGENT,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "es-ES,es;q=0.9,en;q=0.8",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(browser ? 10000 : 5000),
    });
    if (!res.ok) return "";
    return await res.text();
  } catch {
    return "";
  }
}

function parseBing(html: string): SearchResult[] {
  const results: SearchResult[] = [];
  const blocks = html.split('<li class="b_algo"');
  for (let i = 1; i < blocks.length; i++) {
    const block = blocks[i];
    const h2 = /<h2[^>]*>([\s\S]*?)<\/h2>/i.exec(block);
    if (!h2) continue;
    const a = /<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i.exec(h2[1]);
    if (!a) continue;
    const url = normalizeWebsite(decodeSearchUrl(a[1]));
    const title = cleanTitle(stripTags(a[2]));
    if (!url || !title || !isAllowedUrl(url)) continue;
    const p = /<p[^>]*>([\s\S]*?)<\/p>/i.exec(block);
    const snippet = cleanSnippet(stripTags(p?.[1] ?? ""));
    results.push({ title, url, snippet });
  }
  return results;
}

function parseDuckDuckGo(html: string): SearchResult[] {
  const results: SearchResult[] = [];
  const re = /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const url = normalizeWebsite(decodeSearchUrl(m[1]));
    const title = cleanTitle(stripTags(m[2]));
    if (!url || !title || !isAllowedUrl(url)) continue;
    const after = html.slice(re.lastIndex);
    const snip = /class="result__snippet"[^>]*>([\s\S]*?)<\/a>/i.exec(after);
    const snippet = cleanSnippet(stripTags(snip?.[1] ?? ""));
    results.push({ title, url, snippet });
  }
  return results;
}

async function searchBing(query: string, count: number, first: number): Promise<SearchResult[]> {
  const url = `https://www.bing.com/search?q=${encodeURIComponent(query)}&count=${count}&first=${first}&setlang=es&mkt=es-ES`;
  const html = await fetchHtml(url, true);
  return parseBing(html);
}

async function searchDuckDuckGo(query: string): Promise<SearchResult[]> {
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  const html = await fetchHtml(url, true);
  return parseDuckDuckGo(html);
}

function interleave(a: SearchResult[], b: SearchResult[]): SearchResult[] {
  const out: SearchResult[] = [];
  const max = Math.max(a.length, b.length);
  for (let i = 0; i < max; i++) {
    if (i < a.length) out.push(a[i]);
    if (i < b.length) out.push(b[i]);
  }
  return out;
}

function dedupResults(list: SearchResult[]): SearchResult[] {
  const seen = new Set<string>();
  const out: SearchResult[] = [];
  for (const r of list) {
    const host = safeHost(r.url);
    const key = host || normKey(r.title);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out;
}

function mapConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;

  const runNext = (): Promise<void> => {
    if (next >= items.length) return Promise.resolve();
    const i = next++;
    return Promise.resolve()
      .then(() => fn(items[i]))
      .then((result) => {
        results[i] = result;
        return runNext();
      });
  };

  const workerCount = Math.max(1, Math.min(limit, items.length));
  const workers = Array.from({ length: workerCount }, runNext);
  return Promise.all(workers).then(() => results);
}

function toInternationalPhone(rawDigits: string, countryCode: string): string {
  if (!rawDigits) return "";
  const cc = callingCodeFor(countryCode);
  let d = rawDigits;
  if (d.startsWith("00")) d = d.slice(2);
  if (!cc) return d;
  if (d.startsWith(cc)) return d;
  return cc + d;
}

function displayPhone(digits: string, countryCode: string): string {
  const cc = callingCodeFor(countryCode);
  const national = cc && digits.startsWith(cc) ? digits.slice(cc.length) : digits;
  return cc ? `+${cc} ${national}`.trim() : `+${digits}`;
}

function dedupeProspects(list: Prospect[]): Prospect[] {
  const seenHost = new Set<string>();
  const seenName = new Set<string>();
  const out: Prospect[] = [];
  for (const prospect of list) {
    const host = safeHost(prospect.website).replace(/^www\./, "");
    const nameKey = normKey(prospect.empresa);
    if (host && seenHost.has(host)) continue;
    if (nameKey && seenName.has(nameKey)) continue;
    if (host) seenHost.add(host);
    if (nameKey) seenName.add(nameKey);
    out.push(prospect);
  }
  return out;
}

async function enrichSearchResults(
  results: SearchResult[],
  countryCode: string,
  cityName: string,
  countryName: string,
  topic: string,
  offset: number,
  maxPages: number
): Promise<Prospect[]> {
  const enriched = await mapConcurrency(results, 6, async (r) => {
    const detail = await enrichProspect({ website: r.url, countryCode }, { maxPages });
    const raw: RawBusiness = {
      name: r.title,
      website: r.url,
      snippet: r.snippet,
      city: cityName,
      countryCode,
      email: detail.bestEmail,
      phone: detail.phoneDigits,
      emails: detail.emails,
      social: detail.social,
      validation: detail.validation,
    };
    return raw;
  });

  return enriched.map((b, i) => {
    const intl = toInternationalPhone(b.phone, countryCode);
    const direction = b.snippet || [cityName, countryName].filter(Boolean).join(", ");
    const whatsappDigits = b.social.whatsapp ? b.social.whatsapp.replace(/\D/g, "") : "";
    return {
      id: `p-${hashString(`${b.name}|${b.website}|${offset + i}`)}`,
      nombre: "",
      empresa: b.name,
      correo: b.email || "No disponible",
      telefono: intl ? displayPhone(intl, countryCode) : "No disponible",
      whatsapp: whatsappDigits ? toInternationalPhone(whatsappDigits, countryCode) : intl,
      direccion: direction,
      website: b.website,
      ciudad: cityName,
      rubro: topic,
      emails: b.emails.length ? b.emails : undefined,
      social: Object.keys(b.social).length ? b.social : undefined,
      emailStatus: b.validation?.status ?? "unknown",
      emailStatusLabel: b.validation?.label ?? "Sin verificar",
      emailReason: b.validation?.reason ?? "",
      enriched: b.emails.length > 0 || Boolean(b.validation),
    } satisfies Prospect;
  });
}

function hostKey(url: string): string {
  return safeHost(url).replace(/^www\./, "");
}

function buildFallbackVariants(topic: string, city: string, plan: { variants: string[] }): string[] {
  if (plan.variants.length) return plan.variants;
  const c = city.trim();
  const t = topic.trim();
  if (!c) return [t];
  return [`${t} ${c}`, `${c} ${t}`, `directorio de ${t} en ${c}`];
}

export async function extractProspects(
  niche: string,
  city: string,
  limit: number
): Promise<{ prospects: Prospect[]; meta: ExtractionMeta }> {
  const geo = await geocodeCity(city);
  const countryCode = geo?.countryCode ?? "";
  const countryName = geo?.countryName ?? "";
  const cityName = geo?.cityName ?? city;
  const topic = niche.trim() || "negocios";
  const plan = planQueries(topic, cityName, countryName);
  const query = plan.query;

  const [bingPage1, ddgResults, overpassProspects, mapsProspects] = await Promise.all([
    searchBing(query, Math.min(limit, 50), 1),
    searchDuckDuckGo(query),
    geo ? extractOverpass(geo, topic, limit) : Promise.resolve([] as Prospect[]),
    geo ? extractGoogleMapsPublic(geo, topic, limit) : Promise.resolve([] as Prospect[]),
  ]);

  const bingResults: SearchResult[] = [...bingPage1];
  if (limit > 50 && bingPage1.length) {
    const bingPage2 = await searchBing(query, Math.min(limit - bingPage1.length, 50), 51);
    bingResults.push(...bingPage2);
  }

  const webResults = dedupResults(interleave(bingResults, ddgResults)).filter(
    (r) => !isForeignTld(safeHost(r.url), countryCode)
  );
  const direct = dedupeProspects([...overpassProspects, ...mapsProspects]).slice(0, limit);
  const remaining = Math.max(0, limit - direct.length);

  let webProspects: Prospect[] = [];
  if (remaining > 0 && webResults.length) {
    const maxPages = limit > 50 ? 2 : 4;
    const targets = webResults.slice(0, remaining);
    webProspects = await enrichSearchResults(
      targets,
      countryCode,
      cityName,
      countryName,
      topic,
      0,
      maxPages
    );
  }

  const usedHosts = new Set<string>();
  const trackHost = (url: string) => {
    const key = hostKey(url);
    if (key) usedHosts.add(key);
  };
  direct.forEach((p) => trackHost(p.website));
  webResults.forEach((r) => trackHost(r.url));

  let prospects = dedupeProspects([...direct, ...webProspects])
    .filter(
      (p) =>
        !p.website ||
        (isAllowedWebsite(p.website) && !isForeignTld(safeHost(p.website), countryCode))
    )
    .slice(0, limit);

  let secondPassUsed = false;
  if (prospects.length < limit) {
    const variants = buildFallbackVariants(topic, cityName, plan);
    for (const variant of variants.slice(0, 4)) {
      if (prospects.length >= limit) break;
      const [bingV, ddgV] = await Promise.all([
        searchBing(variant, 20, 1),
        searchDuckDuckGo(variant),
      ]);
      const results = dedupResults(interleave(bingV, ddgV)).filter(
        (r) => !isForeignTld(safeHost(r.url), countryCode) && !usedHosts.has(hostKey(r.url))
      );
      if (!results.length) continue;
      const needed = limit - prospects.length;
      const extra = await enrichSearchResults(
        results.slice(0, needed),
        countryCode,
        cityName,
        countryName,
        topic,
        prospects.length,
        2
      );
      results.forEach((r) => trackHost(r.url));
      if (!extra.length) continue;
      prospects = dedupeProspects([...prospects, ...extra]).slice(0, limit);
      secondPassUsed = true;
    }
  }

  const sources: string[] = [];
  if (overpassProspects.length) sources.push("OpenStreetMap (Overpass)");
  if (mapsProspects.length) sources.push("Google Maps");
  if (bingResults.length || secondPassUsed) sources.push("Bing");
  if (ddgResults.length || secondPassUsed) sources.push("DuckDuckGo");

  return {
    prospects,
    meta: {
      source: sources.join(" + ") || "Web",
      countryCode,
      countryName: countryNameFor(countryCode, countryName),
      cityName,
    },
  };
}
