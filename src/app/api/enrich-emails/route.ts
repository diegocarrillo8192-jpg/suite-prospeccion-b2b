import { NextRequest, NextResponse } from "next/server";
import { scanWebsite, rankEmails } from "@/lib/enricher";
import { pickBestEmail, validateEmail } from "@/lib/validators/email-validator";
import {
  ContactsError,
  extractContactsWithApify,
  hostOf,
  type SiteContacts,
} from "@/lib/engines/apify-contacts";
import { normalizeWebsite } from "@/lib/engines/shared";
import { emptyTechStack } from "@/lib/tech-detector";
import type { SocialLinks } from "@/lib/types";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_ITEMS = 25;

interface EmailItem {
  id: string;
  website: string;
}

function isSafeUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") return false;
    const host = url.hostname.toLowerCase();
    if (!host) return false;
    if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) return false;
    if (host.includes(":")) return false;
    if (/^(127\.|10\.|0\.|169\.254\.)/.test(host)) return false;
    if (/^192\.168\./.test(host)) return false;
    if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return false;
    return true;
  } catch {
    return false;
  }
}

function readItem(value: unknown): EmailItem | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const id = typeof record.id === "string" ? record.id.slice(0, 120) : "";
  if (!id) return null;
  const website = typeof record.website === "string" ? record.website.trim().slice(0, 500) : "";
  return { id, website };
}

export async function POST(request: NextRequest) {
  const forwarded = request.headers.get("x-forwarded-for") ?? "";
  const ip = forwarded.split(",")[0]?.trim() || "local";

  const rl = rateLimit(ip, { capacity: 12, refillAmount: 1, refillPerMs: 1200 });
  if (!rl.ok) {
    return NextResponse.json(
      {
        success: false,
        error: "rate_limited",
        message: "Demasiadas extracciones seguidas. Espera un momento.",
        retryAfter: rl.retryAfter,
      },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } }
    );
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: "invalid_json" }, { status: 400 });
  }

  const body = (payload && typeof payload === "object" ? payload : {}) as Record<string, unknown>;
  const rawItems = Array.isArray(body.items) ? body.items.slice(0, MAX_ITEMS) : [];
  const apifyToken = typeof body.apifyToken === "string" ? body.apifyToken.trim().slice(0, 200) : "";
  const emailActor = typeof body.emailActor === "string" ? body.emailActor.trim().slice(0, 120) : "";

  const items = rawItems.map(readItem).filter((item): item is EmailItem => item !== null);
  if (items.length === 0) {
    return NextResponse.json(
      {
        success: false,
        error: "missing_items",
        message: "Envía al menos un prospecto con sitio web para extraer correos.",
      },
      { status: 400 }
    );
  }

  const safeById = new Map<string, string>();
  for (const item of items) {
    safeById.set(item.id, item.website && isSafeUrl(item.website) ? item.website : "");
  }

  let apifyContacts = new Map<string, SiteContacts>();
  let apifyError = "";
  let usedApify = false;
  const apifyWebsites = Array.from(safeById.values()).filter(Boolean);

  if (apifyToken && emailActor && apifyWebsites.length > 0) {
    try {
      apifyContacts = await extractContactsWithApify({
        websites: apifyWebsites,
        token: apifyToken,
        actor: emailActor,
      });
      usedApify = true;
    } catch (error) {
      apifyError =
        error instanceof ContactsError
          ? error.message
          : "No se pudo usar Apify para extraer correos.";
    }
  }

  const results = await Promise.all(
    items.map(async (item) => {
      const safeWebsite = safeById.get(item.id) ?? "";
      const normalized = safeWebsite ? normalizeWebsite(safeWebsite) : "";
      const fromApify = normalized ? apifyContacts.get(normalized) : undefined;

      let emails: string[] = fromApify ? [...fromApify.emails] : [];
      let social: SocialLinks = fromApify ? { ...fromApify.social } : {};
      let source: "apify" | "html" | "none" = fromApify && fromApify.emails.length ? "apify" : "none";
      let tech = emptyTechStack();

      if (safeWebsite) {
        const scan = await scanWebsite(safeWebsite, {
          maxPages: 4,
          timeoutMs: 6000,
          concurrency: 3,
        });
        tech = scan.tech;
        if (emails.length === 0 && scan.emails.length > 0) {
          emails = scan.emails;
          source = "html";
        }
        social = { ...social, ...scan.social };
      }

      const ranked = rankEmails(emails, safeWebsite ? hostOf(safeWebsite) : "");
      const bestEmail = pickBestEmail(ranked);
      const validation = bestEmail ? await validateEmail(bestEmail) : null;

      return {
        id: item.id,
        emails: ranked,
        bestEmail,
        social,
        emailStatus: validation?.status ?? "unknown",
        emailStatusLabel: validation?.label ?? "Sin verificar",
        emailReason: validation?.reason ?? "",
        source,
        techStack: tech.detected,
        techSsl: tech.ssl,
        techServer: tech.server,
        webOpportunity: tech.analyzed ? tech.opportunity : null,
      };
    })
  );

  return NextResponse.json({
    success: true,
    results,
    usedApify,
    message: apifyError || undefined,
  });
}
