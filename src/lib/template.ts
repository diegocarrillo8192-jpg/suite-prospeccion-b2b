import type { Prospect } from "./types";

const NOT_AVAILABLE = /^no disponible$/i;

function clean(value: string | undefined): string {
  const v = (value ?? "").trim();
  return NOT_AVAILABLE.test(v) ? "" : v;
}

/** Nombre de saludo: el contacto si existe, o «equipo de {empresa}». */
export function greetingName(p: Prospect): string {
  const nombre = clean(p.nombre);
  if (nombre && nombre.toLowerCase() !== "contacto") return nombre;
  const empresa = clean(p.empresa);
  return empresa && empresa !== "Sin empresa" ? `equipo de ${empresa}` : "";
}

const FIELDS: Record<string, (p: Prospect) => string> = {
  nombre: greetingName,
  empresa: (p) => clean(p.empresa),
  ciudad: (p) => clean(p.ciudad),
  correo: (p) => clean(p.correo),
  rubro: (p) => clean(p.rubro),
  telefono: (p) => clean(p.telefono),
  whatsapp: (p) => clean(p.whatsapp),
  website: (p) => clean(p.website),
  sitio_web: (p) => clean(p.website).replace(/^https?:\/\//, "").replace(/\/$/, "") || "tu sitio web",
  direccion: (p) => clean(p.direccion),
};

/** Elimina saltos de línea vacíos que deja una variable sin valor en la firma. */
function tidySignature(html: string): string {
  return html.replace(/(<!--F:firma-->)([\s\S]*?)(<!--\/F:firma-->)/g, (_, open, inner: string, close) => {
    const tidy = inner
      .replace(/(?:<br\s*\/?>\s*){2,}/gi, "<br />")
      .replace(/^(?:\s*<br\s*\/?>)+/i, "")
      .replace(/(?:<br\s*\/?>\s*)+$/i, "");
    return `${open}${tidy}${close}`;
  });
}

export function renderTemplate(
  template: string,
  p: Prospect,
  extras?: Record<string, string>
): string {
  const out = template.replace(/\{\{\s*([a-záéíóúñ_]+)\s*\}\}/gi, (match, key: string) => {
    const k = key.toLowerCase();
    if (extras && extras[k] !== undefined) return extras[k];
    const fn = FIELDS[k];
    return fn ? fn(p) : match;
  });
  // «Hola ,» → «Hola,» cuando falta el nombre del contacto.
  return tidySignature(out).replace(/([A-Za-zÁÉÍÓÚáéíóúñÑ]) +,/g, "$1,");
}

export interface SenderIdentity {
  senderName: string;
  senderEmail: string;
  senderPhone?: string;
  /** URL https o data URI de la imagen del logo. */
  logoUrl?: string;
}

function escapeAttr(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** HTML de la cabecera: el logo si existe o el nombre de la empresa en texto. */
export function logoHtml(logoUrl: string | undefined, brand: string): string {
  const src = (logoUrl ?? "").trim();
  if (src && (/^https:\/\//i.test(src) || /^data:image\/(png|jpe?g|gif|webp);base64,/i.test(src))) {
    return `<img src="${escapeAttr(src)}" alt="${escapeAttr(brand || "Logo")}" style="display:inline-block;max-height:52px;max-width:220px;height:auto;border:0;outline:none;text-decoration:none;" />`;
  }
  if (!brand) return "";
  return `<span style="font-size:18px;font-weight:700;letter-spacing:0.5px;color:inherit;">${escapeAttr(brand)}</span>`;
}

export const SIGNATURE_DEFAULTS = {
  nombre_remitente: "Nombre del Remitente",
  empresa_remitente: "Nombre de la Empresa",
  correo_remitente: "correo@tudominio.com",
  telefono_remitente: "+00 000 000 0000",
} as const;

/**
 * Variables del remitente. En la vista previa (`preview: true`) los datos que
 * faltan se muestran como ejemplo; en un envío real se dejan vacíos para no
 * mandar datos de relleno a los prospectos.
 */
export function senderExtras(
  sender: SenderIdentity,
  options: { preview?: boolean } = {}
): Record<string, string> {
  const preview = options.preview ?? false;
  const fallback = (key: keyof typeof SIGNATURE_DEFAULTS) => (preview ? SIGNATURE_DEFAULTS[key] : "");
  const [primary, company] = sender.senderName
    .trim()
    .split("|")
    .map((part) => part.trim());
  const nombreRemitente = primary || fallback("nombre_remitente");
  const empresaRemitente = company || primary || fallback("empresa_remitente");
  return {
    logo: logoHtml(sender.logoUrl, empresaRemitente),
    nombre_remitente: nombreRemitente,
    empresa_remitente: empresaRemitente,
    correo_remitente: sender.senderEmail.trim() || fallback("correo_remitente"),
    telefono_remitente: (sender.senderPhone ?? "").trim() || fallback("telefono_remitente"),
    remitente: nombreRemitente,
  };
}

export function isHtmlTemplate(body: string): boolean {
  return /<\/?[a-z][\s\S]*>/i.test(body);
}

/** Versión en texto plano de un HTML (parte alternativa del correo). */
export function htmlToPlainText(html: string): string {
  return html
    // El preheader oculto no aporta nada en texto plano.
    .replace(/<div style="display:none[^"]*">[\s\S]*?<\/div>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<a\b[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, (_, href: string, text: string) => {
      const label = text.replace(/<[^>]+>/g, "").trim();
      return href && !href.startsWith("#") && label !== href ? `${label} (${href})` : label;
    })
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h[1-6]|tr|li|table)>/gi, "\n")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&zwnj;|&#847;|&#8203;/g, "")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, "&")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export const CHIPS: { token: string; label: string }[] = [
  { token: "{{nombre}}", label: "Nombre" },
  { token: "{{empresa}}", label: "Empresa" },
  { token: "{{ciudad}}", label: "Ciudad" },
  { token: "{{rubro}}", label: "Rubro" },
  { token: "{{telefono}}", label: "Teléfono" },
  { token: "{{sitio_web}}", label: "Sitio Web" },
];

/** Inserta el texto de vista previa (preheader) oculto al inicio del correo. */
export function withPreheader(html: string, preheader: string): string {
  const text = preheader.trim();
  if (!text) return html;
  const safe = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  // El relleno evita que el cliente muestre el inicio del cuerpo tras el preheader.
  const filler = "&#847;&zwnj;&nbsp;".repeat(40);
  return `<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">${safe}${filler}</div>${html}`;
}

const SPAM_WORDS = [
  "gratis",
  "100%",
  "urgente",
  "gana dinero",
  "dinero fácil",
  "sin costo",
  "oferta limitada",
  "haz clic aquí",
  "click aquí",
  "compra ahora",
  "garantizado",
  "millonario",
  "premio",
  "felicidades",
  "$$$",
  "crédito",
  "préstamo",
];

export interface SpamSignal {
  level: "warn" | "info";
  text: string;
}

/** Revisión rápida de entregabilidad del asunto y el contenido. */
export function spamSignals(subject: string, bodyHtml: string): SpamSignal[] {
  const signals: SpamSignal[] = [];
  const s = subject.trim();
  const plain = htmlToPlainText(bodyHtml).toLowerCase();
  if (!s) signals.push({ level: "warn", text: "El asunto está vacío." });
  if (s.length > 70) signals.push({ level: "warn", text: `Asunto largo (${s.length} caracteres): se cortará en móviles. Ideal: menos de 60.` });
  if (/[!?]{2,}/.test(s)) signals.push({ level: "warn", text: "Evita signos repetidos (!!, ??) en el asunto." });
  const letters = s.replace(/[^A-Za-zÁÉÍÓÚÑ]/g, "");
  if (letters.length > 8 && letters === letters.toUpperCase()) {
    signals.push({ level: "warn", text: "El asunto está en MAYÚSCULAS; los filtros lo penalizan." });
  }
  const hits = SPAM_WORDS.filter((w) => s.toLowerCase().includes(w) || plain.includes(w));
  if (hits.length) signals.push({ level: "warn", text: `Palabras que activan filtros de spam: ${hits.slice(0, 4).join(", ")}.` });
  if (!/\{\{\s*(nombre|empresa)\s*\}\}/i.test(subject + bodyHtml)) {
    signals.push({ level: "info", text: "Personaliza con {{nombre}} o {{empresa}} para mejorar la apertura." });
  }
  const links = (bodyHtml.match(/<a\b/gi) ?? []).length;
  if (links > 5) signals.push({ level: "warn", text: `Hay ${links} enlaces; más de 5 aumenta el riesgo de spam.` });
  if (/tudominio\.com/i.test(bodyHtml)) {
    signals.push({
      level: "info",
      text: "El botón usa el enlace de ejemplo: se enviará con tu web (Ajustes del Remitente) o, si no la tienes, con tu correo.",
    });
  }
  return signals;
}

const PLACEHOLDER_LINK = /https?:\/\/(www\.)?tudominio\.com\/?/gi;

/** Normaliza una web escrita por el usuario («acme.com» → «https://acme.com»). */
export function normalizeSiteUrl(value: string): string {
  const v = (value ?? "").trim();
  if (!v) return "";
  const url = /^https?:\/\//i.test(v) ? v : `https://${v}`;
  try {
    return new URL(url).toString();
  } catch {
    return "";
  }
}

/**
 * Sustituye el enlace de ejemplo de las plantillas (tudominio.com) por la web
 * del remitente o, si no tiene, por un enlace para responder por correo.
 */
export function resolvePlaceholderLinks(
  html: string,
  sender: { senderWebsite?: string; senderEmail?: string; replyTo?: string }
): string {
  const site = normalizeSiteUrl(sender.senderWebsite ?? "");
  const email = (sender.replyTo ?? "").trim() || (sender.senderEmail ?? "").trim();
  const target = site || (email ? `mailto:${email}` : "");
  return target ? html.replace(PLACEHOLDER_LINK, target) : html;
}

/** Añade al final del correo el aviso para darse de baja. */
export function withUnsubscribeNotice(html: string, replyEmail: string): string {
  const email = replyEmail.trim();
  const link = email
    ? `<a href="mailto:${email}?subject=BAJA" style="color:#64748b;text-decoration:underline;">responde con la palabra BAJA</a>`
    : "responde con la palabra BAJA";
  return `${html}<div style="max-width:600px;margin:12px auto 0;padding:0 24px 24px;font-family:Arial,Helvetica,sans-serif;font-size:11px;line-height:1.6;color:#94a3b8;text-align:center;">Si no deseas recibir más correos como este, ${link} y no volveremos a escribirte.</div>`;
}
