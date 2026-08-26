import { NextRequest, NextResponse } from "next/server";
import { isValidEmail, sanitizeHtml } from "@/lib/sanitize";
import { rateLimit } from "@/lib/rate-limit";

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

export async function POST(request: NextRequest) {
  const forwarded = request.headers.get("x-forwarded-for") ?? "";
  const ip = forwarded.split(",")[0]?.trim() || "local";

  const rl = rateLimit(ip, { capacity: 8, refillAmount: 1, refillPerMs: 2500 });
  if (!rl.ok) {
    return NextResponse.json(
      {
        success: false,
        error: "rate_limited",
        message: "Demasiadas solicitudes. Espera antes de continuar.",
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
  const subject = typeof body.subject === "string" ? body.subject.slice(0, 200) : "";
  const rawBody = typeof body.body === "string" ? body.body.slice(0, 50000) : "";

  if (!isValidEmail(to)) {
    return NextResponse.json({ success: false, error: "invalid_email" }, { status: 400 });
  }
  if (!subject.trim()) {
    return NextResponse.json({ success: false, error: "missing_subject" }, { status: 400 });
  }

  const safeBody = sanitizeHtml(rawBody);

  // Punto de integración real: aquí se conectaría el proveedor SMTP/API
  // (Resend, SES, SendGrid, etc.) usando credenciales cifradas del lado del
  // cliente. En esta demo se simula la entrega y se reserva un pequeño
  // porcentaje determinista de "rebotes" para ilustrar el monitor de envíos.
  const bounce = hashString(to) % 9 === 0;
  if (bounce) {
    return NextResponse.json({
      success: false,
      error: "bounce",
      message: "Entrega rechazada (simulación de rebote).",
    });
  }

  return NextResponse.json({
    success: true,
    id: `msg_${Date.now()}_${hashString(to)}`,
    bodyLength: safeBody.length,
  });
}
