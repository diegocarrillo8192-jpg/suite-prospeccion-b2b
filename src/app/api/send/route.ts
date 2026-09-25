import { NextRequest, NextResponse } from "next/server";
import { isValidEmail, sanitizeHtml } from "@/lib/sanitize";
import { rateLimit } from "@/lib/rate-limit";
import { deterministicHash, parseProviderConfig } from "@/lib/email-providers";
import { sendEmail } from "@/lib/server-mailer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
  const config = parseProviderConfig(payload);

  const to = typeof body.to === "string" ? body.to.trim() : "";
  const subject = typeof body.subject === "string" ? body.subject.slice(0, 200) : "";
  const rawBody = typeof body.body === "string" ? body.body.slice(0, 50000) : "";

  if (!isValidEmail(to)) {
    return NextResponse.json({ success: false, error: "invalid_email" }, { status: 400 });
  }
  if (!subject.trim()) {
    return NextResponse.json({ success: false, error: "missing_subject" }, { status: 400 });
  }
  if (config.mode !== "simulated" && !isValidEmail(config.senderEmail)) {
    return NextResponse.json(
      {
        success: false,
        error: "invalid_sender",
        message: "El correo remitente no es válido.",
      },
      { status: 400 }
    );
  }

  const safeBody = sanitizeHtml(rawBody);

  if (config.mode === "simulated") {
    // En modo demostración se reserva un porcentaje determinista de "rebotes"
    // para ilustrar el monitor de envíos sin conectar un proveedor real.
    if (deterministicHash(to) % 9 === 0) {
      return NextResponse.json({
        success: false,
        error: "bounce",
        message: "Entrega rechazada (simulación de rebote).",
      });
    }
    return NextResponse.json({
      success: true,
      id: `msg_${Date.now()}_${deterministicHash(to)}`,
      provider: "Simulado (Demo)",
      bodyLength: safeBody.length,
    });
  }

  const result = await sendEmail(config, {
    to,
    subject,
    html: safeBody,
  });

  return NextResponse.json(result, { status: result.success ? 200 : 502 });
}
