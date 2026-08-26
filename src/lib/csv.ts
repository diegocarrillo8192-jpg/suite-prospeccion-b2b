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

export function parseCsv(text: string): Partial<Prospect>[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];

  const headers = parseLine(lines[0]).map((h) => h.trim().toLowerCase());
  const idx = (names: string[]) => {
    for (const n of names) {
      const i = headers.indexOf(n);
      if (i >= 0) return i;
    }
    return -1;
  };
  const get = (row: string[], names: string[]) => {
    const i = idx(names);
    return i >= 0 ? (row[i] ?? "").trim() : "";
  };

  return lines.slice(1).map((line) => {
    const row = parseLine(line);
    return {
      nombre: get(row, ["nombre", "name", "contacto"]),
      empresa: get(row, ["empresa", "company", "organizacion", "organización"]),
      correo: get(row, ["correo", "email", "mail", "e-mail"]),
      telefono: get(row, ["telefono", "teléfono", "phone", "telephone"]),
      whatsapp: get(row, ["whatsapp", "wa", "whatsapp number"]),
      direccion: get(row, ["direccion", "dirección", "address"]),
      website: get(row, ["website", "web", "sitio web", "url"]),
      ciudad: get(row, ["ciudad", "city", "ubicacion", "ubicación"]),
      rubro: get(row, ["rubro", "nicho", "industry", "sector"]),
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
