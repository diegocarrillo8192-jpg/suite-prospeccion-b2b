import { NextRequest, NextResponse } from "next/server";
import {
  extractProspectsWithEngine,
  ExtractionError,
  isEngineId,
  type EngineId,
} from "@/lib/prospect-service";
import { sanitizeText } from "@/lib/sanitize";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ALLOWED_LIMITS = [10, 25, 50, 100];

function readKey(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function messageForError(error: ExtractionError): string {
  switch (error.code) {
    case "missing_apify_key":
      return "Añade tu API Key de Apify en Configuración de Proveedores.";
    case "missing_google_key":
      return "Añade tu API Key de Google Places en Configuración de Proveedores.";
    case "city_not_found":
      return "No se pudo ubicar esa ciudad. Verifica el nombre e intenta de nuevo.";
    case "apify_unreachable":
    case "google_unreachable":
      return "No se pudo contactar al proveedor. Revisa tu conexión e intenta de nuevo.";
    case "apify_error":
    case "google_error":
      return error.message || "El proveedor rechazó la solicitud. Revisa tu API Key y cuota.";
    default:
      return "No se pudieron obtener resultados en este momento. Intenta de nuevo.";
  }
}

export async function POST(request: NextRequest) {
  const forwarded = request.headers.get("x-forwarded-for") ?? "";
  const ip = forwarded.split(",")[0]?.trim() || "local";

  const rl = rateLimit(ip, { capacity: 5, refillAmount: 1, refillPerMs: 6000 });
  if (!rl.ok) {
    return NextResponse.json(
      {
        success: false,
        error: "rate_limited",
        message: "Demasiadas búsquedas. Espera antes de continuar.",
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

  const niche = sanitizeText(typeof body.niche === "string" ? body.niche : "").slice(0, 60);
  const city = sanitizeText(typeof body.city === "string" ? body.city : "").slice(0, 80);
  const rawLimit = typeof body.limit === "number" ? body.limit : 25;
  const limit = ALLOWED_LIMITS.includes(rawLimit) ? rawLimit : 25;
  const engine: EngineId = isEngineId(body.engine) ? body.engine : "free";
  const apifyToken = readKey(body.apifyToken, 200);
  const apifyActor = readKey(body.apifyActor, 120);
  const googleKey = readKey(body.googleKey, 200);

  if (!city.trim()) {
    return NextResponse.json(
      { success: false, error: "missing_city", message: "Indica una ubicación / ciudad." },
      { status: 400 }
    );
  }

  if (engine === "apify" && !apifyToken) {
    return NextResponse.json(
      {
        success: false,
        error: "missing_apify_key",
        message: "Añade tu API Key de Apify en Configuración de Proveedores.",
      },
      { status: 400 }
    );
  }

  if (engine === "google" && !googleKey) {
    return NextResponse.json(
      {
        success: false,
        error: "missing_google_key",
        message: "Añade tu API Key de Google Places en Configuración de Proveedores.",
      },
      { status: 400 }
    );
  }

  try {
    const { prospects, meta } = await extractProspectsWithEngine({
      engine,
      niche: niche || "negocios",
      city,
      limit,
      keys: { apifyToken, apifyActor, googleKey },
    });
    return NextResponse.json({ success: true, prospects, meta });
  } catch (err) {
    if (err instanceof ExtractionError) {
      const status = err.code.startsWith("missing_") ? 400 : 502;
      return NextResponse.json(
        { success: false, error: err.code, message: messageForError(err) },
        { status }
      );
    }
    return NextResponse.json(
      {
        success: false,
        error: "extraction_failed",
        message: "No se pudieron obtener resultados en este momento. Intenta de nuevo.",
      },
      { status: 502 }
    );
  }
}
