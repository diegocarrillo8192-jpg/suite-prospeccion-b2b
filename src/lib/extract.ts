import type { Prospect } from "./types";
import { callingCodeFor, countryNameFor } from "./country-codes";

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

interface GeoLocation {
  countryCode: string;
  countryName: string;
  cityName: string;
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
}

interface NominatimResult {
  address?: Record<string, string>;
}

const EXCLUDED_DOMAINS = new Set([
  "bing.com",
  "duckduckgo.com",
  "microsoft.com",
  "google.com",
  "facebook.com",
  "instagram.com",
  "youtube.com",
  "twitter.com",
  "x.com",
  "linkedin.com",
  "tiktok.com",
  "pinterest.com",
  "yelp.com",
  "tripadvisor.com",
]);

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

function safeHost(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function isAllowedUrl(url: string): boolean {
  const host = safeHost(url);
  if (!host) return false;
  if (EXCLUDED_DOMAINS.has(host)) return false;
  return !EXCLUDED_DOMAINS.has(host.replace(/^www\./, ""));
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
    if (d.length >= 7 && d.length <= 13) return d;
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
    return { email: pickBestEmail(findEmails(html)), phone: findPhone(html) };
  } catch {
    return { email: "", phone: "" };
  }
}

async function fetchJson(url: string, headers: Record<string, string>): Promise<unknown> {
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function geocodeCity(city: string): Promise<GeoLocation | null> {
  try {
    const url = `${NOMINATIM_BASE}/search?format=jsonv2&limit=1&addressdetails=1&accept-language=es&q=${encodeURIComponent(city)}`;
    const data = (await fetchJson(url, { "User-Agent": USER_AGENT, "Accept-Language": "es" })) as NominatimResult[];
    const first = data?.[0];
    if (!first) return null;
    const addr = (first.address ?? {}) as Record<string, string>;
    return {
      countryCode: (addr.country_code ?? "").toUpperCase(),
      countryName: addr.country ?? "",
      cityName: addr.city ?? addr.town ?? addr.village ?? addr.municipality ?? addr.state ?? city,
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

function buildQuery(niche: string, city: string): string {
  const n = niche.trim();
  const c = city.trim();
  if (n && c) return `${n} en ${c}`;
  return c || n;
}

export async function extractProspects(
  niche: string,
  city: string,
  limit: number
): Promise<{ prospects: Prospect[]; meta: ExtractionMeta }> {
  const geo = await geocodeCity(city);
  const countryCode = geo?.countryCode ?? "";
  const cityName = geo?.cityName ?? city;
  const query = buildQuery(niche || "negocios", city);

  const sources: string[] = [];

  const bingResults: SearchResult[] = [];
  const bingPage1 = await searchBing(query, Math.min(limit, 50), 1);
  bingResults.push(...bingPage1);
  if (limit > 50 && bingPage1.length) {
    const bingPage2 = await searchBing(query, Math.min(limit - bingPage1.length, 50), 51);
    bingResults.push(...bingPage2);
  }
  if (bingResults.length) sources.push("Bing");

  const ddgResults = await searchDuckDuckGo(query);
  if (ddgResults.length) sources.push("DuckDuckGo");

  const results = dedupResults(interleave(bingResults, ddgResults)).slice(0, limit);

  const enriched = await mapConcurrency(results, 8, async (r) => {
    let email = "";
    let phone = "";
    if (r.url) {
      const scraped = await scrapeContact(r.url);
      email = scraped.email;
      phone = scraped.phone;
    }
    const raw: RawBusiness = {
      name: r.title,
      website: r.url,
      snippet: r.snippet,
      city: cityName,
      countryCode,
      email,
      phone,
    };
    return raw;
  });

  const prospects: Prospect[] = enriched.map((b, i) => {
    const intl = toInternationalPhone(b.phone, countryCode);
    const direction = b.snippet || [cityName, geo?.countryName].filter(Boolean).join(", ");
    return {
      id: `p-${hashString(`${b.name}|${b.website}|${i}`)}`,
      nombre: "",
      empresa: b.name,
      correo: b.email || "No disponible",
      telefono: intl ? displayPhone(intl, countryCode) : "No disponible",
      whatsapp: intl,
      direccion: direction,
      website: b.website,
      ciudad: cityName,
      rubro: niche.trim() || "negocios",
    };
  });

  return {
    prospects,
    meta: {
      source: sources.join(" + ") || "Web",
      countryCode,
      countryName: countryNameFor(countryCode, geo?.countryName ?? ""),
      cityName,
    },
  };
}
