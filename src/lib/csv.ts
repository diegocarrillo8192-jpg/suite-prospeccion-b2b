import type { Prospect } from "./types";

const HEADERS: (keyof Prospect)[] = [
  "nombre",
  "empresa",
  "correo",
  "telefono",
  "whatsapp",
  "direccion",
  "website",
  "ciudad",
  "rubro",
];

function esc(v: string): string {
  if (/[",;\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

export function prospectsToCsv(prospects: Prospect[]): string {
  const rows = [HEADERS.join(",")];
  for (const p of prospects) {
    rows.push(HEADERS.map((h) => esc(String(p[h]))).join(","));
  }
  return rows.join("\n");
}

export function downloadCsv(prospects: Prospect[], filename = "prospectos.csv"): void {
  const csv = prospectsToCsv(prospects);
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function normalizeHeader(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function parseCsv(text: string): Partial<Prospect>[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];

  const headers = parseLine(lines[0]).map(normalizeHeader);
  const idx = (names: string[]) => {
    for (const n of names) {
      const target = normalizeHeader(n);
      const exact = headers.indexOf(target);
      if (exact >= 0) return exact;
    }
    for (const n of names) {
      const target = normalizeHeader(n);
      if (!target) continue;
      const partial = headers.findIndex(
        (h) => h.length > 0 && (h.includes(target) || target.includes(h))
      );
      if (partial >= 0) return partial;
    }
    return -1;
  };

  const cols = {
    nombre: idx(["nombre", "nombres", "name", "full name", "nombre completo", "contacto", "contact"]),
    empresa: idx([
      "empresa",
      "company",
      "company name",
      "organizacion",
      "organization",
      "razon social",
      "negocio",
      "business",
    ]),
    correo: idx(["correo", "email", "e mail", "mail", "correo electronico", "email address"]),
    telefono: idx(["telefono", "phone", "telephone", "tel", "celular", "movil", "mobile"]),
    whatsapp: idx(["whatsapp", "wa", "whatsapp number", "wsp"]),
    direccion: idx(["direccion", "address", "domicilio", "calle"]),
    website: idx(["website", "web", "sitio web", "url", "sitio", "pagina web"]),
    ciudad: idx(["ciudad", "city", "localidad", "ubicacion", "location", "town"]),
    rubro: idx(["rubro", "nicho", "industry", "sector", "categoria", "giro", "activity"]),
  };
  const get = (row: string[], i: number) => (i >= 0 ? (row[i] ?? "").trim() : "");

  return lines.slice(1).map((line) => {
    const row = parseLine(line);
    return {
      nombre: get(row, cols.nombre),
      empresa: get(row, cols.empresa),
      correo: get(row, cols.correo),
      telefono: get(row, cols.telefono),
      whatsapp: get(row, cols.whatsapp),
      direccion: get(row, cols.direccion),
      website: get(row, cols.website),
      ciudad: get(row, cols.ciudad),
      rubro: get(row, cols.rubro),
    };
  });
}

function parseLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === "," || ch === ";") {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}
