import type { Prospect } from "./types";

const FIELDS: Record<string, (p: Prospect) => string> = {
  nombre: (p) => p.nombre,
  empresa: (p) => p.empresa,
  ciudad: (p) => p.ciudad,
  correo: (p) => p.correo,
  rubro: (p) => p.rubro,
  telefono: (p) => p.telefono,
  whatsapp: (p) => p.whatsapp,
  website: (p) => p.website,
  sitio_web: (p) => p.website,
  direccion: (p) => p.direccion,
};

export function renderTemplate(
  template: string,
  p: Prospect,
  extras?: Record<string, string>
): string {
  return template.replace(/\{\{\s*([a-záéíóúñ_]+)\s*\}\}/gi, (match, key: string) => {
    const k = key.toLowerCase();
    if (extras && extras[k] !== undefined) return extras[k];
    const fn = FIELDS[k];
    return fn ? fn(p) : match;
  });
}

export interface SenderIdentity {
  senderName: string;
  senderEmail: string;
}

export const SIGNATURE_DEFAULTS = {
  nombre_remitente: "Nombre del Remitente",
  empresa_remitente: "Nombre de la Empresa",
  correo_remitente: "correo@tudominio.com",
  telefono_remitente: "+00 000 000 0000",
} as const;

export function senderExtras(sender: SenderIdentity): Record<string, string> {
  const [primary, company] = sender.senderName
    .trim()
    .split("|")
    .map((part) => part.trim());
  const nombreRemitente = primary || SIGNATURE_DEFAULTS.nombre_remitente;
  return {
    nombre_remitente: nombreRemitente,
    empresa_remitente: company || SIGNATURE_DEFAULTS.empresa_remitente,
    correo_remitente: sender.senderEmail.trim() || SIGNATURE_DEFAULTS.correo_remitente,
    telefono_remitente: SIGNATURE_DEFAULTS.telefono_remitente,
    remitente: nombreRemitente,
  };
}

export function isHtmlTemplate(body: string): boolean {
  return /<\/?[a-z][\s\S]*>/i.test(body);
}

export const CHIPS: { token: string; label: string }[] = [
  { token: "{{nombre}}", label: "Nombre" },
  { token: "{{empresa}}", label: "Empresa" },
  { token: "{{ciudad}}", label: "Ciudad" },
  { token: "{{telefono}}", label: "Teléfono" },
  { token: "{{sitio_web}}", label: "Sitio Web" },
];
