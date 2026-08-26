import type { Prospect } from "./types";

const FIELDS: Record<string, (p: Prospect) => string> = {
  nombre: (p) => p.nombre,
  empresa: (p) => p.empresa,
  ciudad: (p) => p.ciudad,
  correo: (p) => p.correo,
  rubro: (p) => p.rubro,
  telefono: (p) => p.telefono,
};

export function renderTemplate(template: string, p: Prospect): string {
  return template.replace(/\{\{\s*([a-záéíóúñ]+)\s*\}\}/gi, (match, key: string) => {
    const fn = FIELDS[key.toLowerCase()];
    return fn ? fn(p) : match;
  });
}

export const CHIPS: { key: string; label: string }[] = [
  { key: "nombre", label: "{{nombre}}" },
  { key: "empresa", label: "{{empresa}}" },
  { key: "ciudad", label: "{{ciudad}}" },
];
