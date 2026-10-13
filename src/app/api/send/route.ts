import { NextRequest, NextResponse } from "next/server";
import { isValidEmail, sanitizeHtml } from "@/lib/sanitize";
import { limitRequest } from "@/lib/rate-limit";
import { deterministicHash, parseProviderConfig } from "@/lib/email-providers";
import { sendEmail } from "@/lib/server-mailer";
import { htmlToPlainText, isHtmlTemplate } from "@/lib/template";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const limited = limitRequest(request, "send", "Demasiadas solicitudes. Espera antes de continuar.", { capacity: 8, refillAmount: 1, refillPerMs: 2500 });
  if (limited) return limited;

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
  const rawBody = typeof body.body === "string" ? body.body.slice(0, 600000) : "";

  if (!isValidEmail(to)) {
    return NextResponse.json(
      { success: false, error: "invalid_email", message: "Dirección de destino no válida." },
      { status: 400 }
    );
  }
  if (!subject.trim()) {
    return NextResponse.json(
      { success: false, error: "missing_subject", message: "El asunto está vacío." },
      { status: 400 }
    );
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

  const isHtml = isHtmlTemplate(rawBody);
  const safeBody = isHtml
    ? sanitizeHtml(rawBody)
    : `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.7;white-space:pre-wrap;">${rawBody
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")}</div>`;
  const text = isHtml ? htmlToPlainText(safeBody) : rawBody;

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
    text,
  });

  return NextResponse.json(result, { status: result.success ? 200 : 502 });
}
