import { NextRequest, NextResponse } from "next/server";
import { isValidEmail, sanitizeHtml } from "@/lib/sanitize";
import { limitRequest } from "@/lib/rate-limit";
import { parseProviderConfig } from "@/lib/email-providers";
import { sendEmail } from "@/lib/server-mailer";
import { htmlToPlainText } from "@/lib/template";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TEST_SUBJECT = "Prueba de conexión - Suite de Prospección B2B";

function testHtml(): string {
  return `<div style="margin:0;padding:24px;background:#eef2f7;font-family:Arial,Helvetica,sans-serif;color:#0f172a;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:14px;border:1px solid #e2e8f0;">
    <tr>
      <td style="padding:28px;">
        <h1 style="margin:0 0 12px;font-size:19px;color:#0f172a;">Tu remitente está listo</h1>
        <p style="margin:0 0 12px;font-size:15px;line-height:1.7;color:#334155;">
          Este es un correo de prueba enviado desde la Suite de Prospección B2B para validar
          tu configuración de envío. Si lo estás viendo, las credenciales funcionan.
        </p>
        <p style="margin:0;font-size:13px;line-height:1.6;color:#64748b;">
          No es necesario responder a este mensaje.
        </p>
      </td>
    </tr>
  </table>
</div>`;
}

export async function POST(request: NextRequest) {
  const limited = limitRequest(request, "send-test", "Demasiadas pruebas seguidas. Espera un momento.", { capacity: 6, refillAmount: 1, refillPerMs: 3000 });
  if (limited) return limited;

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: "invalid_json" }, { status: 400 });
  }

  const raw = (payload && typeof payload === "object" ? payload : {}) as Record<string, unknown>;
  const config = parseProviderConfig(payload);
  const to = typeof raw.to === "string" ? raw.to.trim() : "";

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

  const subject =
    typeof raw.subject === "string" && raw.subject.trim() ? raw.subject.slice(0, 200) : TEST_SUBJECT;
  const html =
    typeof raw.body === "string" && raw.body.trim() ? sanitizeHtml(raw.body.slice(0, 600000)) : testHtml();

  const result = await sendEmail(config, {
    to,
    subject,
    html,
    text:
      typeof raw.body === "string" && raw.body.trim()
        ? htmlToPlainText(html)
        : "Tu remitente está listo. Este es un correo de prueba de la Suite de Prospección B2B.",
  });

  return NextResponse.json(
    {
      ...result,
      message:
        result.success && !result.message
          ? `Correo de prueba enviado a ${to} vía ${result.provider}.`
          : result.message,
    },
    { status: result.success ? 200 : 400 }
  );
}
