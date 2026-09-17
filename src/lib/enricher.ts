import type { EmailValidation, SocialLinks } from "./types";
import { pickBestEmail, validateEmail } from "./validators/email-validator";
import { formatPhone, normalizeWebsite } from "./engines/shared";
import { detectTechStack, emptyTechStack, type TechStack } from "./tech-detector";
import { mapLimit } from "./concurrency";

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

const CONTACT_PATHS = [
  "contacto",
  "contact",
  "contactenos",
  "contactanos",
  "nosotros",
  "about",
  "about-us",
  "quienes-somos",
  "empresa",
  "terms",
  "terminos",
  "aviso-legal",
  "legal",
  "soporte",
  "support",
];

const LINK_KEYWORDS =
  /(contacto|contact|nosotros|about|quienes|empresa|company|terms|terminos|legal|aviso|soporte|support|ayuda|help|team|equipo)/i;

const IMAGE_EXT = /\.(png|jpe?g|gif|svg|webp|ico|avif|css|js|pdf)([?#].*)?$/i;
const BAD_EMAIL_HINTS = /(example|domain|yourname|youremail|sentry|wixpress|email\.com|no-?reply@|@sentry)/i;

export interface SiteScan {
  emails: string[];
  phones: string[];
  social: SocialLinks;
  pagesScanned: number;
  tech: TechStack;
}

export interface EnrichmentResult {
  emails: string[];
  bestEmail: string;
  social: SocialLinks;
  phoneDisplay: string;
  phoneDigits: string;
  validation: EmailValidation | null;
  pagesScanned: number;
  enriched: boolean;
  tech: TechStack;
}

function decodeEntities(input: string): string {
  return input
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&aacute;/gi, "á")
    .replace(/&eacute;/gi, "é")
    .replace(/&iacute;/gi, "í")
    .replace(/&oacute;/gi, "ó")
    .replace(/&uacute;/gi, "ú")
    .replace(/&ntilde;/gi, "ñ")
    .replace(/&uuml;/gi, "ü")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&nbsp;/gi, " ")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function findEmails(html: string): string[] {
  const decoded = decodeEntities(html)
    .replace(/&#x40;|&#64;|%40/gi, "@")
    .replace(/&#46;/gi, ".");
  const re = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;
  const found: string[] = [];
  const seen = new Set<string>();
  for (const match of decoded.match(re) ?? []) {
    const email = match.toLowerCase();
    if (IMAGE_EXT.test(email)) continue;
    if (BAD_EMAIL_HINTS.test(email)) continue;
    if (email.length > 120) continue;
    if (seen.has(email)) continue;
    seen.add(email);
    found.push(email);
  }
  return found;
}

function findPhones(html: string): string[] {
  const candidates: string[] = [];
  const telRe = /(?:href|content)=["']?tel:([+\d][\d\s().-]{4,}[\d])/gi;
  for (const match of html.matchAll(telRe)) candidates.push(match[1]);

  const intlRe = /(?:\+\d{1,3}[\s.-]?)(?:\(?\d{1,4}\)?[\s.-]?){2,}\d{2,}/g;
  for (const match of html.match(intlRe) ?? []) candidates.push(match);

  const output: string[] = [];
  const seen = new Set<string>();
  for (const candidate of candidates) {
    const digits = candidate.replace(/\D/g, "").replace(/^00/, "");
    if (digits.length < 7 || digits.length > 15) continue;
    if (seen.has(digits)) continue;
    seen.add(digits);
    output.push(candidate.trim());
  }
  return output;
}

function cleanUrl(value: string): string {
  try {
    const url = new URL(value);
    url.hash = "";
    url.search = "";
    return url.toString();
  } catch {
    return "";
  }
}

function findSocialLinks(html: string): SocialLinks {
  const social: SocialLinks = {};
  const text = decodeEntities(html);

  const instagram = /(?:https?:\/\/)?(?:www\.)?instagram\.com\/([A-Za-z0-9_.]{2,30})/i.exec(text);
  if (instagram && !/^(p|reel|reels|explore|accounts|stories|tv)$/i.test(instagram[1])) {
    social.instagram = `https://instagram.com/${instagram[1]}`;
  }

  const linkedin =
    /(?:https?:\/\/)?(?:[a-z]{2,3}\.)?linkedin\.com\/(company|in|school)\/([A-Za-z0-9._%+-]{2,80})/i.exec(
      text
    );
  if (linkedin) social.linkedin = `https://linkedin.com/${linkedin[1].toLowerCase()}/${linkedin[2]}`;

  const facebook = /(?:https?:\/\/)?(?:www\.|m\.)?facebook\.com\/([A-Za-z0-9._-]{3,80})/i.exec(text);
  if (facebook && !/^(sharer|plugins|dialog|tr|share|login|profile\.php)$/i.test(facebook[1])) {
    social.facebook = `https://facebook.com/${facebook[1]}`;
  } else {
    const fbShort = /(?:https?:\/\/)?fb\.me\/([A-Za-z0-9._-]{3,80})/i.exec(text);
    if (fbShort) social.facebook = `https://facebook.com/${fbShort[1]}`;
  }

  const twitter =
    /(?:https?:\/\/)?(?:www\.)?(?:twitter\.com|x\.com)\/([A-Za-z0-9_]{2,30})/i.exec(text);
  if (twitter && !/^(intent|share|home|hashtag|i|search|widgets)$/i.test(twitter[1])) {
    social.twitter = `https://twitter.com/${twitter[1]}`;
  }

  const waDirect = /(?:https?:\/\/)?(?:www\.)?wa\.me\/(\d{6,15})/i.exec(text);
  const waApi = /(?:api|web)\.whatsapp\.com\/send\?[^"'\s>]*phone=(\d{6,15})/i.exec(text);
  const waScheme = /whatsapp:\/\/send\?[^"'\s>]*phone=(\d{6,15})/i.exec(text);
  const waNumber = waDirect?.[1] ?? waApi?.[1] ?? waScheme?.[1];
  if (waNumber) social.whatsapp = `https://wa.me/${waNumber}`;

  const youtube =
    /(?:https?:\/\/)?(?:www\.)?youtube\.com\/(channel|c|user|@)\/?([A-Za-z0-9._-]{2,80})/i.exec(text);
  if (youtube) {
    const prefix = youtube[1] === "@" ? "@" : `${youtube[1]}/`;
    social.youtube = `https://youtube.com/${prefix}${youtube[2]}`;
  }

  const tiktok = /(?:https?:\/\/)?(?:www\.)?tiktok\.com\/@([A-Za-z0-9._]{2,40})/i.exec(text);
  if (tiktok) social.tiktok = `https://tiktok.com/@${tiktok[1]}`;

  return social;
}

function discoverContactLinks(html: string, baseUrl: string): string[] {
  const baseHost = hostOf(baseUrl);
  if (!baseHost) return [];
  const links: string[] = [];
  const seen = new Set<string>();
  const hrefRe = /href=["']([^"']+)["']/gi;
  for (const match of html.matchAll(hrefRe)) {
    const raw = decodeEntities(match[1]);
    if (!raw || raw.startsWith("#") || raw.startsWith("mailto:") || raw.startsWith("tel:")) continue;
    let resolved: URL;
    try {
      resolved = new URL(raw, baseUrl);
    } catch {
      continue;
    }
    if (resolved.protocol !== "http:" && resolved.protocol !== "https:") continue;
    if (resolved.hostname.toLowerCase() !== baseHost) continue;
    if (IMAGE_EXT.test(resolved.pathname)) continue;
    if (!LINK_KEYWORDS.test(resolved.pathname)) continue;
    const clean = cleanUrl(resolved.toString());
    if (!clean || seen.has(clean)) continue;
    seen.add(clean);
    links.push(clean);
  }
  return links;
}

interface FetchedPage {
  html: string;
  headers: Record<string, string>;
  url: string;
  ssl: boolean;
}

async function fetchPage(url: string, timeoutMs: number): Promise<FetchedPage | null> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": BROWSER_UA,
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "es-ES,es;q=0.9,en;q=0.8",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return null;
    const contentType = res.headers.get("content-type") ?? "";
    if (contentType && !contentType.includes("html") && !contentType.includes("text")) return null;
    const buffer = await res.arrayBuffer();
    const html = new TextDecoder("utf-8").decode(buffer).slice(0, 800_000);
    const headers: Record<string, string> = {};
    res.headers.forEach((value, key) => {
      headers[key.toLowerCase()] = value;
    });
    const finalUrl = res.url || url;
    return { html, headers, url: finalUrl, ssl: finalUrl.startsWith("https://") };
  } catch {
    return null;
  }
}

export async function scanWebsite(
  website: string,
  options?: { maxPages?: number; timeoutMs?: number; concurrency?: number }
): Promise<SiteScan> {
  const base = normalizeWebsite(website);
  if (!base) return { emails: [], phones: [], social: {}, pagesScanned: 0, tech: emptyTechStack() };

  const maxPages = Math.max(1, options?.maxPages ?? 4);
  const timeoutMs = options?.timeoutMs ?? 6000;
  const concurrency = Math.max(1, options?.concurrency ?? 3);

  const emails = new Set<string>();
  const phones = new Set<string>();
  const social: SocialLinks = {};
  const htmlChunks: string[] = [];
  let pagesScanned = 0;

  const homepage = await fetchPage(base, timeoutMs);
  if (homepage) {
    pagesScanned++;
    htmlChunks.push(homepage.html);
    findEmails(homepage.html).forEach((email) => emails.add(email));
    findPhones(homepage.html).forEach((phone) => phones.add(phone));
    Object.assign(social, stripEmpty(findSocialLinks(homepage.html)));
  }

  let origin = "";
  try {
    origin = new URL(base).origin;
  } catch {
    origin = "";
  }

  const targets: string[] = [];
  const seenTargets = new Set<string>([cleanUrl(base)]);
  const pushTarget = (url: string) => {
    const clean = cleanUrl(url);
    if (!clean || seenTargets.has(clean) || IMAGE_EXT.test(clean)) return;
    seenTargets.add(clean);
    targets.push(clean);
  };

  if (homepage && origin) discoverContactLinks(homepage.html, base).forEach(pushTarget);
  if (origin) {
    for (const path of CONTACT_PATHS) {
      try {
        pushTarget(new URL(`/${path}`, origin).toString());
      } catch {
        // ruta inválida, se omite
      }
    }
  }

  const limited = targets.slice(0, Math.max(0, maxPages - (homepage ? 1 : 0)));
  const pages = await mapLimit(limited, concurrency, async (url) => ({
    page: await fetchPage(url, timeoutMs),
  }));

  for (const { page } of pages) {
    if (!page) continue;
    pagesScanned++;
    htmlChunks.push(page.html);
    findEmails(page.html).forEach((email) => emails.add(email));
    findPhones(page.html).forEach((phone) => phones.add(phone));
    Object.assign(social, stripEmpty(findSocialLinks(page.html)));
  }

  const tech = homepage
    ? detectTechStack({
        html: htmlChunks.join("\n"),
        headers: homepage.headers,
        url: homepage.url,
      })
    : emptyTechStack();

  return {
    emails: Array.from(emails),
    phones: Array.from(phones),
    social,
    pagesScanned,
    tech,
  };
}

function stripEmpty(social: SocialLinks): SocialLinks {
  const output: SocialLinks = {};
  for (const [key, value] of Object.entries(social)) {
    if (value) output[key as keyof SocialLinks] = value;
  }
  return output;
}

export function rankEmails(emails: string[], websiteHost: string): string[] {
  const host = websiteHost.replace(/^www\./, "");
  const sameDomain: string[] = [];
  const others: string[] = [];
  const seen = new Set<string>();
  for (const email of emails) {
    const normalized = (email ?? "").trim().toLowerCase();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    const domain = normalized.slice(normalized.lastIndexOf("@") + 1).replace(/^www\./, "");
    if (host && (domain === host || host.endsWith(`.${domain}`) || domain.endsWith(`.${host}`))) {
      sameDomain.push(normalized);
    } else {
      others.push(normalized);
    }
  }
  return [...sameDomain, ...others];
}

export async function enrichProspect(
  input: {
    website?: string;
    correo?: string;
    telefono?: string;
    countryCode?: string;
  },
  options?: { maxPages?: number; timeoutMs?: number; concurrency?: number }
): Promise<EnrichmentResult> {
  const website = (input.website ?? "").trim();
  const countryCode = (input.countryCode ?? "").trim().toUpperCase();
  const existingEmail =
    input.correo && /@/.test(input.correo) && !/^no disponible$/i.test(input.correo)
      ? input.correo.trim().toLowerCase()
      : "";

  const existingValidation: Promise<EmailValidation | null> = existingEmail
    ? validateEmail(existingEmail)
    : Promise.resolve(null);

  const scan: SiteScan = website
    ? await scanWebsite(website, options)
    : { emails: [], phones: [], social: {}, pagesScanned: 0, tech: emptyTechStack() };

  const social = { ...scan.social };
  if (social.whatsapp) {
    const rawWaDigits = social.whatsapp.replace(/\D/g, "");
    const normalized = rawWaDigits ? formatPhone(rawWaDigits, countryCode).digits : "";
    social.whatsapp = normalized ? `https://wa.me/${normalized}` : scan.social.whatsapp;
  }

  const host = website ? hostOf(normalizeWebsite(website)) : "";
  const allEmails = Array.from(new Set([...scan.emails, existingEmail].filter(Boolean)));
  const ranked = rankEmails(allEmails, host);
  const bestEmail = pickBestEmail(ranked) || existingEmail;

  const validation =
    bestEmail && bestEmail === existingEmail
      ? await existingValidation
      : bestEmail
        ? await validateEmail(bestEmail)
        : await existingValidation;

  const waDigits = social.whatsapp ? social.whatsapp.replace(/\D/g, "") : "";
  const phoneRaw = waDigits || scan.phones[0] || input.telefono || "";
  const phone = phoneRaw ? formatPhone(phoneRaw, countryCode) : { display: "", digits: "" };

  return {
    emails: ranked,
    bestEmail,
    social,
    phoneDisplay: phone.display,
    phoneDigits: phone.digits,
    validation,
    pagesScanned: scan.pagesScanned,
    enriched: scan.pagesScanned > 0,
    tech: scan.tech,
  };
}
