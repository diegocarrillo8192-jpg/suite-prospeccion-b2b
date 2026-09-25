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

export function senderExtras(sender: SenderIdentity): Record<string, string> {
  const name = sender.senderName.trim() || "Tu Nombre";
  const [primary, company] = name.split("|");
  return {
    remitente: primary.trim() || name,
    empresa_remitente: (company?.trim() || primary.trim() || "Tu Empresa"),
    correo_remitente: sender.senderEmail.trim() || "tucorreo@tudominio.com",
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
