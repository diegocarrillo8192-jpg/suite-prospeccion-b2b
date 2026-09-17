import { NextRequest, NextResponse } from "next/server";
import { enrichProspect } from "@/lib/enricher";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_ITEMS = 25;

interface EnrichItem {
  id: string;
  website: string;
  correo: string;
  telefono: string;
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

function readItem(value: unknown): EnrichItem | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const id = typeof record.id === "string" ? record.id.slice(0, 120) : "";
  if (!id) return null;
  const website = typeof record.website === "string" ? record.website.trim().slice(0, 500) : "";
  const correo = typeof record.correo === "string" ? record.correo.trim().slice(0, 200) : "";
  const telefono = typeof record.telefono === "string" ? record.telefono.trim().slice(0, 60) : "";
  return { id, website, correo, telefono };
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
        message: "Demasiados enriquecimientos seguidos. Espera un momento.",
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
  const countryCode =
    typeof body.countryCode === "string" ? body.countryCode.trim().toUpperCase().slice(0, 2) : "";

  const items = rawItems.map(readItem).filter((item): item is EnrichItem => item !== null);
  if (items.length === 0) {
    return NextResponse.json(
      { success: false, error: "missing_items", message: "Envía al menos un prospecto para enriquecer." },
      { status: 400 }
    );
  }

  const results = await Promise.all(
    items.map(async (item) => {
      const safeWebsite = item.website && isSafeUrl(item.website) ? item.website : "";
      const detail = await enrichProspect(
        {
          website: safeWebsite,
          correo: item.correo,
          telefono: item.telefono,
          countryCode,
        },
        { maxPages: 4, timeoutMs: 6000, concurrency: 3 }
      );
      return {
        id: item.id,
        emails: detail.emails,
        bestEmail: detail.bestEmail,
        social: detail.social,
        phoneDisplay: detail.phoneDisplay,
        phoneDigits: detail.phoneDigits,
        emailStatus: detail.validation?.status ?? "unknown",
        emailStatusLabel: detail.validation?.label ?? "Sin verificar",
        emailReason: detail.validation?.reason ?? "",
        hasMx: detail.validation?.hasMx ?? false,
        disposable: detail.validation?.disposable ?? false,
        enriched: detail.enriched,
        techStack: detail.tech.detected,
        techSsl: detail.tech.ssl,
        techServer: detail.tech.server,
        webOpportunity: detail.tech.analyzed ? detail.tech.opportunity : null,
      };
    })
  );

  return NextResponse.json({ success: true, results });
}
