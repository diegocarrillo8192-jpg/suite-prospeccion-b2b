import { NextRequest, NextResponse } from "next/server";
import { isValidEmail } from "@/lib/sanitize";
import { rateLimit } from "@/lib/rate-limit";
import { parseProviderConfig } from "@/lib/email-providers";
import { verifyConnection } from "@/lib/server-mailer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const forwarded = request.headers.get("x-forwarded-for") ?? "";
  const ip = forwarded.split(",")[0]?.trim() || "local";

  const rl = rateLimit(ip, { capacity: 6, refillAmount: 1, refillPerMs: 3000 });
  if (!rl.ok) {
    return NextResponse.json(
      {
        success: false,
        error: "rate_limited",
        message: "Demasiadas pruebas seguidas. Espera un momento.",
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

  const config = parseProviderConfig(payload);

  if (config.mode !== "simulated" && !isValidEmail(config.senderEmail)) {
    return NextResponse.json(
      {
        success: false,
        error: "invalid_email",
        message: "Define un correo remitente válido antes de probar la conexión.",
      },
      { status: 400 }
    );
  }

  const result = await verifyConnection(config);
  return NextResponse.json(result, { status: result.success ? 200 : 400 });
}
