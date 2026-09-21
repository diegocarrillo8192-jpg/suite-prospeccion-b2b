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
    id: "corporativa",
    name: "Corporativa",
    description: "Logo superior, tarjeta contenedora, botón CTA y firma.",
    accent: "#0b1220",
    subject: "Propuesta de colaboración para {{empresa}}",
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
        <p style="margin:0 0 14px;font-size:15px;line-height:1.7;color:#334155;"><!--F:mensaje-->En {{empresa_remitente}} acompañamos a organizaciones como {{empresa}} en {{ciudad}} a alcanzar sus objetivos con soluciones a medida.<br /><br />Me gustaría coordinar una breve reunión para mostrarle cómo podemos generar valor.<!--/F:mensaje--></p>
        <table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0;">
          <tr>
            <td style="border-radius:10px;background:#059669;">
              <a data-cta href="https://tudominio.com" style="display:inline-block;padding:13px 26px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;"><!--F:ctaTexto-->Agendar una reunión<!--/F:ctaTexto--></a>
            </td>
          </tr>
        </table>
        <p style="margin:20px 0 0;font-size:15px;line-height:1.6;color:#334155;"><!--F:firma-->Saludos cordiales,<br />{{remitente}}<br />{{correo_remitente}}<!--/F:firma--></p>
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
    id: "carta",
    name: "Carta Comercial",
    description: "Texto limpio y minimalista con firma profesional.",
    accent: "#1e293b",
    subject: "Una propuesta pensada para {{empresa}}",
    html: `<div style="margin:0;padding:24px;background:#ffffff;font-family:Georgia,'Times New Roman',serif;color:#1e293b;">
  <div style="max-width:580px;margin:0 auto;font-size:16px;line-height:1.75;">
    <p style="margin:0 0 18px;color:#64748b;font-size:13px;letter-spacing:0.4px;text-transform:uppercase;">{{ciudad}}</p>
    <p style="margin:0 0 18px;"><!--F:saludo-->Estimado/a {{nombre}}:<!--/F:saludo--></p>
    <p style="margin:0 0 18px;"><!--F:mensaje-->Me dirijo a usted para presentarle nuestra propuesta de servicios, pensada especialmente para {{empresa}}. Creemos que podemos aportar una mejora concreta a su operación actual.<br /><br />El objetivo de esta carta es simplemente abrir la conversación: si lo considera oportuno, con gusto puedo compartirle más detalles y ejemplos de casos similares.<!--/F:mensaje--></p>
    <p style="margin:0 0 18px;">
      <a data-cta href="https://tudominio.com" style="color:#2563eb;text-decoration:underline;"><!--F:ctaTexto-->Ver la propuesta completa<!--/F:ctaTexto--></a>
    </p>
    <p style="margin:28px 0 0;">Atentamente,</p>
    <p style="margin:18px 0 0;font-family:Arial,Helvetica,sans-serif;line-height:1.5;"><!--F:firma-->{{remitente}}<br />{{empresa_remitente}}<br />{{correo_remitente}}<!--/F:firma--></p>
  </div>
</div>`,
  },
  {
    id: "promocional",
    name: "Promocional",
    description: "Enfocada en conversión con bloque de beneficios.",
    accent: "#7c3aed",
    subject: "{{empresa}}: una oportunidad para crecer",
    html: `<div style="margin:0;padding:24px;background:#f5f3ff;font-family:Arial,Helvetica,sans-serif;color:#1e1b4b;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:18px;overflow:hidden;border:1px solid #ddd6fe;">
    <tr>
      <td style="background:#7c3aed;padding:30px 28px;text-align:center;">
        <p style="margin:0 0 6px;font-size:12px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#ddd6fe;">Propuesta de servicio</p>
        <h1 style="margin:0;font-size:24px;line-height:1.3;color:#ffffff;"><!--F:saludo-->Potenciá {{empresa}} junto a {{empresa_remitente}}<!--/F:saludo--></h1>
      </td>
    </tr>
    <tr>
      <td style="padding:30px 28px;">
        <p style="margin:0 0 20px;font-size:15px;line-height:1.7;color:#475569;"><!--F:mensaje-->Hola {{nombre}}, vimos que {{empresa}} está creciendo en {{ciudad}} y queremos acompañar ese proceso con una solución a tu medida.<!--/F:mensaje--></p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
          <tr>
            <td style="padding:8px 0;font-size:15px;line-height:1.6;color:#334155;">✅ &nbsp;Más alcance y nuevos clientes</td>
          </tr>
          <tr>
            <td style="padding:8px 0;font-size:15px;line-height:1.6;color:#334155;">⚡ &nbsp;Procesos más rápidos y ordenados</td>
          </tr>
          <tr>
            <td style="padding:8px 0;font-size:15px;line-height:1.6;color:#334155;">📈 &nbsp;Resultados medibles desde el primer mes</td>
          </tr>
        </table>
        <table role="presentation" cellpadding="0" cellspacing="0">
          <tr>
            <td style="border-radius:10px;background:#7c3aed;">
              <a data-cta href="https://tudominio.com" style="display:inline-block;padding:14px 30px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;"><!--F:ctaTexto-->Quiero más información<!--/F:ctaTexto--></a>
            </td>
          </tr>
        </table>
        <p style="margin:26px 0 0;font-size:15px;line-height:1.6;color:#334155;"><!--F:firma-->Un saludo,<br />{{remitente}}<br />{{correo_remitente}}<!--/F:firma--></p>
      </td>
    </tr>
  </table>
</div>`,
  },
];

export const EMAIL_TEMPLATES: EmailTemplatePreset[] = RAW_TEMPLATES.map((raw) => ({
  ...raw,
  defaults: parseFields(raw.html),
  build: (fields: TemplateFields) => applyFieldsToHtml(raw.html, fields),
}));
