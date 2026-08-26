import { NextRequest, NextResponse } from "next/server";
import { extractProspects } from "@/lib/extract";
import { sanitizeText } from "@/lib/sanitize";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ALLOWED_LIMITS = [10, 25, 50, 100];

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

  if (!city.trim()) {
    return NextResponse.json(
      { success: false, error: "missing_city", message: "Indica una ubicación / ciudad." },
      { status: 400 }
    );
  }

  try {
    const { prospects, meta } = await extractProspects(niche || "negocios", city, limit);
    return NextResponse.json({ success: true, prospects, meta });
  } catch (err) {
    const message =
      err instanceof Error && err.message === "city_not_found"
        ? "No se pudo ubicar esa ciudad. Verifica el nombre e intenta de nuevo."
        : "No se pudieron obtener resultados en este momento. Intenta de nuevo.";
    return NextResponse.json({ success: false, error: "extraction_failed", message }, { status: 502 });
  }
}
