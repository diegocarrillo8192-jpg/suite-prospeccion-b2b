import { NextRequest, NextResponse } from "next/server";
import { isValidEmail } from "@/lib/sanitize";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MODES = ["smtp", "resend", "sendgrid", "simulated"] as const;

const MODE_LABELS: Record<(typeof MODES)[number], string> = {
  smtp: "SMTP Personalizado",
  resend: "Resend API Key",
  sendgrid: "SendGrid API Key",
  simulated: "Simulado (Demo)",
};

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

  const body = (payload && typeof payload === "object" ? payload : {}) as Record<string, unknown>;
  const to = typeof body.to === "string" ? body.to.trim() : "";
  const mode = MODES.includes(body.mode as (typeof MODES)[number])
    ? (body.mode as (typeof MODES)[number])
    : "simulated";

  if (!isValidEmail(to)) {
    return NextResponse.json(
      {
        success: false,
        error: "invalid_email",
        message: "Define un correo remitente válido para enviar la prueba.",
      },
      { status: 400 }
    );
  }

  // Punto de integración real: aquí se conectaría el proveedor SMTP o la API
  // del remitente (Resend / SendGrid). En esta demo se confirma la validación
  // y se simula la entrega de un correo de prueba.
  return NextResponse.json({
    success: true,
    id: `test_${Date.now()}`,
    provider: MODE_LABELS[mode],
    message: `Correo de prueba aceptado por ${MODE_LABELS[mode]}.`,
  });
}
