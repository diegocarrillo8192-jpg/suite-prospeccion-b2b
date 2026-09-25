export interface TemplateFields {
  saludo: string;
  mensaje: string;
  ctaTexto: string;
  ctaEnlace: string;
  firma: string;
}

interface RawTemplate {
  id: string;
  name: string;
  description: string;
  accent: string;
  subject: string;
  html: string;
}

export interface EmailTemplatePreset extends RawTemplate {
  defaults: TemplateFields;
  build: (fields: TemplateFields) => string;
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeAttr(value: string): string {
  return escapeHtml(value).replace(/"/g, "&quot;");
}

function textToHtml(value: string): string {
  return escapeHtml(value).replace(/\r?\n/g, "<br />");
}

function htmlToText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h1|h2|h3)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .trim();
}

function getRegion(html: string, name: keyof TemplateFields): string {
  const re = new RegExp(`<!--F:${name}-->([\\s\\S]*?)<!--/F:${name}-->`);
  return html.match(re)?.[1] ?? "";
}

function setRegion(html: string, name: keyof TemplateFields, content: string): string {
  const re = new RegExp(`(<!--F:${name}-->)[\\s\\S]*?(<!--/F:${name}-->)`);
  if (!re.test(html)) return html;
  return html.replace(re, `$1${content}$2`);
}

function getCtaHref(html: string): string {
  const tag = html.match(/<a\b[^>]*\bdata-cta\b[^>]*>/i)?.[0] ?? "";
  return (tag.match(/href="([^"]*)"/i)?.[1] ?? "").trim();
}

export function parseFields(html: string): TemplateFields {
  return {
    saludo: htmlToText(getRegion(html, "saludo")),
    mensaje: htmlToText(getRegion(html, "mensaje")),
    ctaTexto: htmlToText(getRegion(html, "ctaTexto")),
    ctaEnlace: getCtaHref(html),
    firma: htmlToText(getRegion(html, "firma")),
  };
}

export function applyFieldsToHtml(html: string, fields: TemplateFields): string {
  let out = setRegion(html, "saludo", escapeHtml(fields.saludo));
  out = setRegion(out, "mensaje", textToHtml(fields.mensaje));
  out = setRegion(out, "ctaTexto", escapeHtml(fields.ctaTexto));
  out = setRegion(out, "firma", textToHtml(fields.firma));
  out = out.replace(/<a\b[^>]*\bdata-cta\b[^>]*>/i, (tag) =>
    tag.replace(/href="[^"]*"/i, `href="${escapeAttr(fields.ctaEnlace)}"`)
  );
  return out;
}

export function hasEditableFields(html: string): boolean {
  return /<!--F:[a-zA-Z]+-->/.test(html);
}

const RAW_TEMPLATES: RawTemplate[] = [
  {
    id: "presentacion",
    name: "Presentación Comercial",
    description: "Encabezado con marca, mensaje breve y botón de contacto.",
    accent: "#0b1220",
    subject: "Propuesta para {{empresa}}",
    html: `<div style="margin:0;padding:24px;background:#eef2f7;font-family:Arial,Helvetica,sans-serif;color:#0f172a;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e2e8f0;">
    <tr>
      <td style="background:#0b1220;padding:22px 28px;text-align:center;">
        <span style="color:#ffffff;font-size:18px;font-weight:700;letter-spacing:1px;">{{empresa_remitente}}</span>
      </td>
    </tr>
    <tr>
      <td style="padding:32px 28px;">
        <h1 style="margin:0 0 14px;font-size:21px;line-height:1.3;color:#0f172a;"><!--F:saludo-->Hola {{nombre}},<!--/F:saludo--></h1>
        <p style="margin:0 0 14px;font-size:15px;line-height:1.7;color:#334155;"><!--F:mensaje-->Trabajamos con organizaciones como {{empresa}} en {{ciudad}} para ayudarlas a alcanzar sus objetivos con soluciones a medida.<br /><br />Me gustaría coordinar una breve reunión para compartirte cómo podemos aportar valor.<!--/F:mensaje--></p>
        <table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0;">
          <tr>
            <td style="border-radius:10px;background:#059669;">
              <a data-cta href="https://tudominio.com" style="display:inline-block;padding:13px 26px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;"><!--F:ctaTexto-->Agendar una reunión<!--/F:ctaTexto--></a>
            </td>
          </tr>
        </table>
        <p style="margin:20px 0 0;font-size:15px;line-height:1.6;color:#334155;"><!--F:firma-->Un saludo,<br />{{nombre_remitente}}<br />{{empresa_remitente}}<br />{{correo_remitente}}<br />{{telefono_remitente}}<!--/F:firma--></p>
      </td>
    </tr>
    <tr>
      <td style="background:#f8fafc;padding:16px 28px;text-align:center;font-size:12px;color:#94a3b8;">
        {{empresa_remitente}} · Todos los derechos reservados
      </td>
    </tr>
  </table>
</div>`,
  },
  {
    id: "propuesta",
    name: "Propuesta de Servicios",
    description: "Estructura comercial con bloque de beneficios y llamada a la acción.",
    accent: "#0e7490",
    subject: "Propuesta de servicios para {{empresa}}",
    html: `<div style="margin:0;padding:24px;background:#ecfeff;font-family:Arial,Helvetica,sans-serif;color:#164e63;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:18px;overflow:hidden;border:1px solid #cffafe;">
    <tr>
      <td style="background:#0e7490;padding:30px 28px;text-align:center;">
        <p style="margin:0 0 6px;font-size:12px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#cffafe;">Propuesta de servicios</p>
        <h1 style="margin:0;font-size:24px;line-height:1.3;color:#ffffff;"><!--F:saludo-->Una propuesta para {{empresa}}<!--/F:saludo--></h1>
      </td>
    </tr>
    <tr>
      <td style="padding:30px 28px;">
        <p style="margin:0 0 20px;font-size:15px;line-height:1.7;color:#475569;"><!--F:mensaje-->Hola {{nombre}}, preparamos una propuesta pensada para las necesidades de {{empresa}} en {{ciudad}}, con un enfoque práctico y medible.<!--/F:mensaje--></p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
          <tr>
            <td style="padding:8px 0;font-size:15px;line-height:1.6;color:#334155;">✅ &nbsp;Alcance claro y objetivos definidos</td>
          </tr>
          <tr>
            <td style="padding:8px 0;font-size:15px;line-height:1.6;color:#334155;">⚡ &nbsp;Implementación ágil y acompañamiento</td>
          </tr>
          <tr>
            <td style="padding:8px 0;font-size:15px;line-height:1.6;color:#334155;">📈 &nbsp;Resultados medibles desde el primer mes</td>
          </tr>
        </table>
        <table role="presentation" cellpadding="0" cellspacing="0">
          <tr>
            <td style="border-radius:10px;background:#0e7490;">
              <a data-cta href="https://tudominio.com" style="display:inline-block;padding:14px 30px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;"><!--F:ctaTexto-->Solicitar una llamada<!--/F:ctaTexto--></a>
            </td>
          </tr>
        </table>
        <p style="margin:26px 0 0;font-size:15px;line-height:1.6;color:#334155;"><!--F:firma-->Un saludo,<br />{{nombre_remitente}}<br />{{empresa_remitente}}<br />{{correo_remitente}}<br />{{telefono_remitente}}<!--/F:firma--></p>
      </td>
    </tr>
  </table>
</div>`,
  },
  {
    id: "auditoria",
    name: "Auditoría Web",
    description: "Diagnóstico personalizado para sitios web, enfocado en mejoras concretas.",
    accent: "#2563eb",
    subject: "Auditoría web para {{empresa}}",
    html: `<div style="margin:0;padding:24px;background:#eff6ff;font-family:Arial,Helvetica,sans-serif;color:#1e3a8a;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #bfdbfe;">
    <tr>
      <td style="padding:30px 28px 10px;">
        <p style="margin:0 0 8px;font-size:12px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#2563eb;">Auditoría web gratuita</p>
        <h1 style="margin:0 0 14px;font-size:22px;line-height:1.3;color:#0f172a;"><!--F:saludo-->Hola {{nombre}},<!--/F:saludo--></h1>
        <p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#334155;"><!--F:mensaje-->Estuvimos revisando {{sitio_web}} y detectamos oportunidades concretas para mejorar el rendimiento, la experiencia de usuario y la conversión de visitantes en {{ciudad}}.<br /><br />Preparamos un diagnóstico sin costo para {{empresa}} con los puntos más importantes a corregir.<!--/F:mensaje--></p>
        <table role="presentation" cellpadding="0" cellspacing="0" style="margin:22px 0;">
          <tr>
            <td style="border-radius:10px;background:#2563eb;">
              <a data-cta href="https://tudominio.com" style="display:inline-block;padding:13px 26px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;"><!--F:ctaTexto-->Ver el diagnóstico<!--/F:ctaTexto--></a>
            </td>
          </tr>
        </table>
        <p style="margin:20px 0 0;font-size:15px;line-height:1.6;color:#334155;"><!--F:firma-->Un saludo,<br />{{nombre_remitente}}<br />{{empresa_remitente}}<br />{{correo_remitente}}<br />{{telefono_remitente}}<!--/F:firma--></p>
      </td>
    </tr>
    <tr>
      <td style="background:#f8fafc;padding:14px 28px;text-align:center;font-size:12px;color:#94a3b8;">
        {{empresa_remitente}}
      </td>
    </tr>
  </table>
</div>`,
  },
  {
    id: "contacto",
    name: "Contacto Directo",
    description: "Mensaje breve y personal, ideal para un primer acercamiento.",
    accent: "#059669",
    subject: "Contacto directo para {{empresa}}",
    html: `<div style="margin:0;padding:24px;background:#ffffff;font-family:Arial,Helvetica,sans-serif;color:#0f172a;">
  <div style="max-width:580px;margin:0 auto;font-size:16px;line-height:1.75;">
    <p style="margin:0 0 6px;font-size:13px;letter-spacing:0.4px;text-transform:uppercase;color:#64748b;">{{ciudad}}</p>
    <p style="margin:0 0 18px;font-size:19px;font-weight:700;"><!--F:saludo-->Hola {{nombre}},<!--/F:saludo--></p>
    <p style="margin:0 0 18px;color:#334155;"><!--F:mensaje-->Te escribo directamente porque creo que podemos ayudar a {{empresa}}. Si quieres, te comparto una idea concreta en una llamada breve de 15 minutos.<br /><br />Puedes responderme a este correo y coordinamos el horario que mejor te venga.<!--/F:mensaje--></p>
    <p style="margin:0 0 18px;">
      <a data-cta href="https://tudominio.com" style="color:#059669;font-weight:700;text-decoration:underline;"><!--F:ctaTexto-->Responder ahora<!--/F:ctaTexto--></a>
    </p>
    <p style="margin:28px 0 0;color:#334155;"><!--F:firma-->Un saludo,<br />{{nombre_remitente}}<br />{{empresa_remitente}}<br />{{correo_remitente}}<br />{{telefono_remitente}}<!--/F:firma--></p>
  </div>
</div>`,
  },
];

export const EMAIL_TEMPLATES: EmailTemplatePreset[] = RAW_TEMPLATES.map((raw) => ({
  ...raw,
  defaults: parseFields(raw.html),
  build: (fields: TemplateFields) => applyFieldsToHtml(raw.html, fields),
}));
