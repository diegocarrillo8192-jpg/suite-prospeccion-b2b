import { NextRequest, NextResponse } from "next/server";
import { limitRequest } from "@/lib/rate-limit";
import { testGooglePlacesKey } from "@/lib/engines/google-places";
import { testApifyToken } from "@/lib/engines/apify";
import { geocodeCity } from "@/lib/extract";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const limited = limitRequest(request, "test-provider", "Demasiadas pruebas seguidas. Espera un momento.", {
    capacity: 6,
    refillAmount: 1,
    refillPerMs: 3000,
  });
  if (limited) return limited;

  let payload: Record<string, unknown>;
  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ success: false, message: "Solicitud inválida." }, { status: 400 });
  }

  const provider = typeof payload.provider === "string" ? payload.provider : "";
  const key = typeof payload.key === "string" ? payload.key.trim().slice(0, 300) : "";

  if (provider === "local") {
    // Verifica que el geocodificador público (OpenStreetMap) responde.
    const geo = await geocodeCity("Ciudad de Panamá");
    return NextResponse.json({
      success: Boolean(geo),
      message: geo
        ? `Motor local operativo · OpenStreetMap responde (${geo.cityName}, ${geo.countryName}).`
        : "No se pudo contactar a OpenStreetMap. Revisa tu conexión a Internet.",
    });
  }

  if (!key) {
    return NextResponse.json({ success: false, message: "Introduce la clave antes de probar." }, { status: 400 });
  }

  const result =
    provider === "google"
      ? await testGooglePlacesKey(key)
      : provider === "apify"
        ? await testApifyToken(key)
        : { ok: false, message: "Proveedor desconocido." };

  return NextResponse.json({ success: result.ok, message: result.message }, { status: result.ok ? 200 : 400 });
}
