import type { Browser, Page } from "playwright";
import type { Prospect, SocialLinks } from "./types";
import type { ExtractionMeta, GeoLocation } from "./extract";
import { extractProspects, geocodeCity } from "./extract";
import { countryNameFor } from "./country-codes";
import { enrichProspect, type EnrichmentResult } from "./enricher";
import { mapLimit } from "./concurrency";
import { filterProspectsByDomain } from "./engines/domains";
import { planQueries } from "./engines/query";
import { formatPhone, makeId, normalizeWebsite } from "./engines/shared";
import { extractGoogleMapsPublic } from "./engines/google-maps";
import {
  MAPS_STATE_SCRIPT,
  buildMapsBrowseUrl,
  fetchMapsSearch,
  parseMapsEntry,
  parseMapsSearchResults,
  type MapsEntry,
} from "./engines/google-maps-state";
import { extractWithApify } from "./engines/apify";
import { extractWithGooglePlaces } from "./engines/google-places";
import type { EngineId, EngineRequest, EngineResult } from "./engines/engine";

export type HybridMode = "local" | "api";

export const DEFAULT_DEEP_CRAWL_LIMIT = 20;
export const DEFAULT_DEEP_CRAWL_TIMEOUT_MS = 5000;
const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const SCRAPE_DEADLINE_MS = 42000;
const NAV_TIMEOUT_MS = 18000;
const DEFAULT_ZOOM = 14;

export interface HybridKeys {
  apifyToken: string;
  googleKey: string;
}

export interface HybridRequest extends EngineRequest {
  engine: EngineId;
  deepCrawl?: boolean;
  deepCrawlLimit?: number;
}

export interface ScrapedPlace {
  name: string;
  phone: string;
  website: string;
  address: string;
  category: string;
  rating: number | null;
  reviews: number | null;
}

export function hasApifyKey(keys: Partial<HybridKeys>): boolean {
  return Boolean(keys.apifyToken && keys.apifyToken.trim().length > 0);
}

export function hasGoogleKey(keys: Partial<HybridKeys>): boolean {
  return Boolean(keys.googleKey && keys.googleKey.trim().length > 0);
}

export function hasApiCredentials(keys: Partial<HybridKeys>): boolean {
  return hasApifyKey(keys) || hasGoogleKey(keys);
}

export function resolveHybridMode(engine: EngineId, keys: Partial<HybridKeys>): HybridMode {
  if (engine === "apify") return hasApifyKey(keys) ? "api" : "local";
  if (engine === "google") return hasGoogleKey(keys) ? "api" : "local";
  return "local";
}

export function apiEngineFor(engine: EngineId, keys: Partial<HybridKeys>): EngineId {
  if (engine === "google" && hasGoogleKey(keys)) return "google";
  if (engine === "apify" && hasApifyKey(keys)) return "apify";
  if (hasGoogleKey(keys)) return "google";
  if (hasApifyKey(keys)) return "apify";
  return "free";
}

export function engineFromMode(mode: HybridMode, preferred: EngineId = "apify"): EngineId {
  if (mode === "local") return "free";
  return preferred === "google" ? "google" : "apify";
}

async function launchChromium(): Promise<Browser | null> {
  try {
    const { chromium } = await import("playwright");
    return await chromium.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-dev-shm-usage",
        "--disable-blink-features=AutomationControlled",
      ],
    });
  } catch {
    return null;
  }
}

async function dismissConsent(page: Page): Promise<void> {
  try {
    await page.evaluate(`() => {
      const form = document.querySelector('form[action*="consent.google"]');
      if (form) {
        const button = form.querySelector('button, input[type="submit"]');
        if (button) { button.click(); return true; }
      }
      const buttons = document.querySelectorAll('button, input[type="submit"]');
      for (const button of buttons) {
        const text = (button.textContent || button.value || '').toLowerCase();
        if (text.includes('reject') || text.includes('decline') || text.includes('rechazar') || text.includes('ablehnen')) {
          button.click();
          return true;
        }
      }
      return false;
    }`);
  } catch {
    // sin diálogo de consentimiento
  }
}

async function collectPlaceHrefs(page: Page, limit: number): Promise<string[]> {
  try {
    await page.waitForSelector('div[role="feed"] a[href*="/maps/place/"]', { timeout: 12000 });
  } catch {
    return [];
  }

  const deadline = Date.now() + 8000;
  let previous = 0;
  while (Date.now() < deadline) {
    const count = await page.locator('div[role="feed"] a[href*="/maps/place/"]').count().catch(() => 0);
    if (count >= limit || count === previous) break;
    previous = count;
    await page
      .evaluate(`() => { const feed = document.querySelector('div[role="feed"]'); if (feed) feed.scrollTop = feed.scrollHeight; }`)
      .catch(() => undefined);
    await page.waitForTimeout(700);
  }

  return page
    .evaluate(() => {
      const hrefs: string[] = [];
      const seen = new Set<string>();
      for (const anchor of document.querySelectorAll<HTMLAnchorElement>('div[role="feed"] a[href*="/maps/place/"]')) {
        const href = anchor.href;
        if (!href || seen.has(href)) continue;
        seen.add(href);
        hrefs.push(href);
      }
      return hrefs;
    })
    .catch(() => [] as string[]);
}

function entryToScraped(entry: MapsEntry): ScrapedPlace {
  return {
    name: entry.name,
    phone: entry.phone,
    website: normalizeWebsite(entry.website),
    address: entry.address,
    category: entry.category,
    rating: entry.rating,
    reviews: entry.reviews,
  };
}

async function readPlaceDom(page: Page, fallbackName: string): Promise<ScrapedPlace | null> {
  try {
    const data = await page.evaluate(() => {
      const textOf = (element: Element | null) =>
        (element?.textContent ?? "").replace(/\s+/g, " ").trim();
      const addressButton = document.querySelector<HTMLElement>('button[data-item-id="address"]');
      const phoneButton = document.querySelector<HTMLElement>('button[data-item-id^="phone:tel:"]');
      const websiteLink = document.querySelector<HTMLAnchorElement>('a[data-item-id="authority"]');
      const categoryButton = document.querySelector<HTMLElement>(
        "button[jsaction*='pane.category'], button[jsaction*='category']"
      );
      const rating = textOf(document.querySelector("div.F7nice span[aria-hidden='true']"));
      const reviews = textOf(
        document.querySelector("div.F7nice span[aria-label*='reseña'], div.F7nice span[aria-label*='review']")
      );
      return {
        name: textOf(document.querySelector("h1")),
        phone: (phoneButton?.getAttribute("data-item-id") ?? "").replace("phone:tel:", "").trim(),
        website: websiteLink?.href ?? "",
        address: (addressButton?.getAttribute("aria-label") ?? "").replace(/^.*?:\s*/, "").trim() || textOf(addressButton),
        category: textOf(categoryButton),
        rating,
        reviews,
      };
    });

    const rating = Number.parseFloat((data.rating ?? "").replace(",", "."));
    const reviewsDigits = (/([\d][\d.,]*)/.exec(data.reviews ?? "")?.[1] ?? "").replace(/[^\d]/g, "");
    const name = (data.name || fallbackName || "").trim();
    if (!name) return null;

    return {
      name,
      phone: (data.phone || "").trim(),
      website: normalizeWebsite(data.website ?? ""),
      address: (data.address || "").trim(),
      category: (data.category || "").trim(),
      rating: Number.isFinite(rating) ? rating : null,
      reviews: reviewsDigits ? Number.parseInt(reviewsDigits, 10) : null,
    };
  } catch {
    return null;
  }
}

async function scrapePlaceState(page: Page, href: string): Promise<ScrapedPlace | null> {
  try {
    await page.goto(href, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT_MS });
    await page.waitForTimeout(600);

    const raw = await page.evaluate<string | null>(MAPS_STATE_SCRIPT).catch(() => null);
    if (raw) {
      const entry = parseMapsEntry(raw);
      if (entry) return entryToScraped(entry);
    }
    return await readPlaceDom(page, "");
  } catch {
    return null;
  }
}

function dedupePlaces(places: ScrapedPlace[]): ScrapedPlace[] {
  const seen = new Set<string>();
  const output: ScrapedPlace[] = [];
  for (const place of places) {
    const key = place.name.toLowerCase().replace(/\s+/g, " ").trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    output.push(place);
  }
  return output;
}

export async function scrapeGoogleMapsLocal(
  geo: GeoLocation,
  niche: string,
  limit: number
): Promise<ScrapedPlace[]> {
  if (!geo.latitude || !geo.longitude || limit <= 0) return [];

  const browser = await launchChromium();
  if (!browser) return [];

  const plan = planQueries(niche.trim() || "negocios", geo.cityName, geo.countryName);
  const browseUrl = buildMapsBrowseUrl(plan.phrase, {
    latitude: geo.latitude,
    longitude: geo.longitude,
    zoom: DEFAULT_ZOOM,
  });
  const deadline = Date.now() + SCRAPE_DEADLINE_MS;
  const context = await browser
    .newContext({ locale: "es-ES", userAgent: BROWSER_UA, viewport: { width: 1366, height: 900 } })
    .catch(() => null);

  if (!context) {
    await browser.close().catch(() => undefined);
    return [];
  }

  const page = await context.newPage().catch(() => null);
  if (!page) {
    await context.close().catch(() => undefined);
    await browser.close().catch(() => undefined);
    return [];
  }

  try {
    await page.goto(browseUrl, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT_MS });
    await dismissConsent(page);
    await page.waitForTimeout(1500);

    const searchState = await page.evaluate<string | null>(MAPS_STATE_SCRIPT).catch(() => null);
    if (searchState) {
      const entries = parseMapsSearchResults(searchState);
      if (entries.length > 0) {
        return dedupePlaces(entries.map(entryToScraped)).slice(0, limit);
      }
    }

    const hrefs = await collectPlaceHrefs(page, limit);
    const places: ScrapedPlace[] = [];
    for (const href of hrefs) {
      if (places.length >= limit || Date.now() > deadline) break;
      const place = await scrapePlaceState(page, href);
      if (place) places.push(place);
    }

    return dedupePlaces(places).slice(0, limit);
  } catch {
    return [];
  } finally {
    await context.close().catch(() => undefined);
    await browser.close().catch(() => undefined);
  }
}

async function httpSearchLocal(geo: GeoLocation, topic: string, limit: number): Promise<ScrapedPlace[]> {
  const plan = planQueries(topic, geo.cityName, geo.countryName);
  const body = await fetchMapsSearch(plan.phrase, {
    latitude: geo.latitude,
    longitude: geo.longitude,
    zoom: DEFAULT_ZOOM,
  });
  if (!body) return [];
  const entries = parseMapsSearchResults(body);
  if (entries.length === 0) return [];
  return dedupePlaces(entries.map(entryToScraped)).slice(0, Math.max(limit, 20));
}

function scrapedPlaceToProspect(
  place: ScrapedPlace,
  geo: GeoLocation,
  topic: string,
  index: number
): Prospect {
  const phone = place.phone ? formatPhone(place.phone, geo.countryCode) : { display: "", digits: "" };
  return {
    id: makeId(place.name, place.website, place.address, phone.digits, index),
    nombre: "",
    empresa: place.name,
    correo: "No disponible",
    telefono: phone.display || "No disponible",
    whatsapp: phone.digits,
    direccion: place.address || geo.cityName,
    website: place.website,
    ciudad: geo.cityName,
    rubro: place.category || topic,
    rating: place.rating ?? undefined,
    reviews: place.reviews ?? undefined,
  };
}

async function extractLocal(request: HybridRequest): Promise<EngineResult> {
  const geo = await geocodeCity(request.city);
  const countryCode = geo?.countryCode ?? "";
  const cityName = geo?.cityName ?? request.city;
  const countryName = countryNameFor(countryCode, geo?.countryName ?? "");
  const topic = request.niche.trim() || "negocios";

  if (geo) {
    let places = await scrapeGoogleMapsLocal(geo, topic, request.limit);
    let source = "Google Maps (Scraping Local · Playwright)";

    if (places.length === 0) {
      places = await httpSearchLocal(geo, topic, request.limit);
      source = "Google Maps (Scraping Local · Endpoint interno)";
    }

    if (places.length > 0) {
      return {
        prospects: places
          .slice(0, request.limit)
          .map((place, index) => scrapedPlaceToProspect(place, geo, topic, index)),
        meta: { source, countryCode, countryName, cityName },
      };
    }

    const httpProspects = await extractGoogleMapsPublic(geo, topic, request.limit);
    if (httpProspects.length > 0) {
      return {
        prospects: httpProspects,
        meta: {
          source: "Google Maps (Scraping Local · HTML)",
          countryCode,
          countryName,
          cityName,
        },
      };
    }
  }

  return extractProspects(topic, request.city, request.limit);
}

function mergeContacts(prospect: Prospect, detail: EnrichmentResult): Prospect {
  const patch: Partial<Prospect> = { enriched: true };

  if (detail.bestEmail) patch.correo = detail.bestEmail;
  if (detail.emails.length > 0) patch.emails = detail.emails;

  const social: SocialLinks = { ...prospect.social, ...detail.social };
  if (Object.keys(social).length > 0) patch.social = social;

  const missingPhone =
    !prospect.whatsapp || prospect.telefono === "No disponible" || prospect.telefono === "";
  if (detail.phoneDigits && missingPhone) {
    patch.telefono = detail.phoneDisplay || prospect.telefono;
    patch.whatsapp = detail.phoneDigits;
  }

  if (detail.validation) {
    patch.emailStatus = detail.validation.status;
    patch.emailStatusLabel = detail.validation.label;
    patch.emailReason = detail.validation.reason;
  }

  return { ...prospect, ...patch };
}

export interface DeepCrawlOptions {
  countryCode?: string;
  limit?: number;
  concurrency?: number;
  maxPages?: number;
  timeoutMs?: number;
}

export async function crawlDeepContacts(
  prospects: Prospect[],
  options: DeepCrawlOptions = {}
): Promise<Prospect[]> {
  const targets = prospects.filter((prospect) => Boolean(prospect.website));
  if (targets.length === 0) return prospects;

  const limit = Math.max(1, options.limit ?? DEFAULT_DEEP_CRAWL_LIMIT);
  const countryCode = options.countryCode ?? "";
  const selected = targets.slice(0, limit);
  const updates = new Map<string, Prospect>();

  await mapLimit(selected, options.concurrency ?? 6, async (prospect) => {
    try {
      const detail = await enrichProspect(
        {
          website: prospect.website,
          correo: prospect.correo,
          telefono: prospect.telefono,
          countryCode,
        },
        {
          maxPages: options.maxPages ?? 3,
          timeoutMs: options.timeoutMs ?? DEFAULT_DEEP_CRAWL_TIMEOUT_MS,
          concurrency: 3,
        }
      );
      updates.set(prospect.id, mergeContacts(prospect, detail));
    } catch {
      updates.set(prospect.id, prospect);
    }
    return null;
  });

  return prospects.map((prospect) => updates.get(prospect.id) ?? prospect);
}

export async function extractWithHybrid(request: HybridRequest): Promise<EngineResult> {
  const keys: HybridKeys = {
    apifyToken: request.apifyToken ?? "",
    googleKey: request.googleKey ?? "",
  };
  const mode = resolveHybridMode(request.engine, keys);

  let result: EngineResult;

  if (mode === "api") {
    const apiEngine = apiEngineFor(request.engine, keys);
    const engineRequest: EngineRequest = {
      niche: request.niche,
      city: request.city,
      limit: request.limit,
      apifyToken: keys.apifyToken,
      apifyActor: request.apifyActor,
      googleKey: keys.googleKey,
    };
    result =
      apiEngine === "google"
        ? await extractWithGooglePlaces(engineRequest)
        : await extractWithApify(engineRequest);
  } else {
    result = await extractLocal(request);
  }

  let prospects = filterProspectsByDomain(result.prospects);

  if (request.deepCrawl !== false && prospects.length > 0) {
    prospects = await crawlDeepContacts(prospects, {
      countryCode: result.meta.countryCode,
      limit: request.deepCrawlLimit ?? DEFAULT_DEEP_CRAWL_LIMIT,
    });
  }

  return { ...result, prospects };
}

export type { ExtractionMeta, EngineResult };
