import type { SocialLinks } from "../types";
import { normalizeWebsite } from "./shared";

const APIFY_BASE = "https://api.apify.com/v2/acts";

export interface SiteContacts {
  emails: string[];
  phones: string[];
  social: SocialLinks;
}

export class ContactsError extends Error {
  readonly code: string;

  constructor(code: string, message?: string) {
    super(message ?? code);
    this.name = "ContactsError";
    this.code = code;
  }
}

function actorPath(actor: string): string {
  const normalized = actor.trim().replace(/\//g, "~").replace(/\/+$/, "");
  return encodeURIComponent(normalized);
}

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function firstOf(value: unknown): string {
  return stringArray(value)[0] ?? "";
}

function whatsappLink(value: unknown): string {
  const entries = stringArray(value);
  for (const entry of entries) {
    const digits = entry.replace(/\D/g, "");
    if (digits.length >= 7 && digits.length <= 15) return `https://wa.me/${digits}`;
  }
  return "";
}

function parseItem(item: Record<string, unknown>): SiteContacts {
  const social: SocialLinks = {};
  const instagram = firstOf(item.instagrams);
  const linkedin = firstOf(item.linkedIns);
  const facebook = firstOf(item.facebooks);
  const youtube = firstOf(item.youtubes);
  const tiktok = firstOf(item.tiktoks);
  const whatsapp = whatsappLink(item.whatsapps);
  if (instagram) social.instagram = instagram;
  if (linkedin) social.linkedin = linkedin;
  if (facebook) social.facebook = facebook;
  if (youtube) social.youtube = youtube;
  if (tiktok) social.tiktok = tiktok;
  if (whatsapp) social.whatsapp = whatsapp;

  return {
    emails: stringArray(item.emails),
    phones: stringArray(item.phones),
    social,
  };
}

function mergeContacts(target: SiteContacts, source: SiteContacts): SiteContacts {
  const emails = new Set(target.emails);
  for (const email of source.emails) emails.add(email);
  const phones = new Set(target.phones);
  for (const phone of source.phones) phones.add(phone);
  return {
    emails: Array.from(emails),
    phones: Array.from(phones),
    social: { ...target.social, ...source.social },
  };
}

function keyForItem(item: Record<string, unknown>, websites: string[]): string {
  const original =
    typeof item.originalStartUrl === "string" ? normalizeWebsite(item.originalStartUrl) : "";
  if (original) {
    const exact = websites.find((url) => url === original);
    if (exact) return exact;
  }

  const domain =
    typeof item.domain === "string" ? item.domain.toLowerCase().replace(/^www\./, "") : "";
  const hostDomain = domain || hostOf(original);
  if (hostDomain) {
    const matched = websites.find((url) => {
      const host = hostOf(url);
      return host === hostDomain || host.endsWith(`.${hostDomain}`) || hostDomain.endsWith(`.${host}`);
    });
    if (matched) return matched;
  }

  return original || "";
}

export async function extractContactsWithApify(input: {
  websites: string[];
  token: string;
  actor: string;
  maxPagesPerSite?: number;
}): Promise<Map<string, SiteContacts>> {
  const token = input.token.trim();
  if (!token) throw new ContactsError("missing_token", "Falta la API Key de Apify.");

  const actor = input.actor.trim();
  if (!actor) throw new ContactsError("missing_actor", "Falta el Actor de extracción de correos.");

  const websites: string[] = [];
  const seen = new Set<string>();
  for (const raw of input.websites) {
    const normalized = normalizeWebsite(raw);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    websites.push(normalized);
  }
  if (websites.length === 0) return new Map();

  const maxPages = Math.max(1, Math.min(input.maxPagesPerSite ?? 3, 10));
  const endpoint = `${APIFY_BASE}/${actorPath(actor)}/run-sync-get-dataset-items?token=${encodeURIComponent(
    token
  )}`;

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        startUrls: websites.map((url) => ({ url })),
        maxRequestsPerStartUrl: maxPages,
        mergeContacts: true,
        maxDepth: 1,
        sameDomain: true,
        considerChildFrames: false,
        maximumLeadsEnrichmentRecords: 0,
        useBrowser: false,
      }),
      signal: AbortSignal.timeout(55000),
    });
  } catch {
    throw new ContactsError("apify_unreachable", "No se pudo contactar a Apify.");
  }

  if (!response.ok) {
    const detail = (await response.text().catch(() => "")).slice(0, 200);
    throw new ContactsError(
      "apify_error",
      `Apify respondió ${response.status}${detail ? `: ${detail}` : ""}`
    );
  }

  const items = (await response.json().catch(() => null)) as unknown;
  if (!Array.isArray(items)) {
    throw new ContactsError("apify_error", "Apify devolvió una respuesta inesperada.");
  }

  const results = new Map<string, SiteContacts>();
  for (const raw of items) {
    if (!raw || typeof raw !== "object") continue;
    const item = raw as Record<string, unknown>;
    const key = keyForItem(item, websites);
    if (!key) continue;
    const parsed = parseItem(item);
    const existing = results.get(key);
    results.set(key, existing ? mergeContacts(existing, parsed) : parsed);
  }

  return results;
}
