import type { Prospect } from "./types";

const HEADERS = [
  "nombre",
  "empresa",
  "correo",
  "telefono",
  "whatsapp",
  "direccion",
  "website",
  "ciudad",
  "rubro",
] as const satisfies readonly (keyof Prospect)[];

function esc(v: string): string {
  if (/[",;\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

export function prospectsToCsv(prospects: Prospect[]): string {
  const rows = [HEADERS.join(",")];
  for (const p of prospects) {
    rows.push(HEADERS.map((h) => esc(String(p[h] ?? ""))).join(","));
  }
  return rows.join("\n");
}

export function downloadCsv(prospects: Prospect[], filename = "prospectos.csv"): void {
  const csv = prospectsToCsv(prospects);
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
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
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export type ContactField = (typeof HEADERS)[number];

const ALIASES: Record<ContactField, string[]> = {
  nombre: ["nombre", "nombres", "name", "full name", "first name", "nombre completo", "contacto", "contact", "persona"],
  empresa: [
    "empresa",
    "company",
    "company name",
    "organizacion",
    "organization",
    "razon social",
    "negocio",
    "business",
    "nombre comercial",
    "title",
  ],
  correo: ["correo", "email", "e mail", "mail", "correo electronico", "email address", "emails", "correos"],
  telefono: ["telefono", "phone", "telephone", "tel", "celular", "movil", "mobile", "numero"],
  whatsapp: ["whatsapp", "wa", "whatsapp number", "wsp"],
  direccion: ["direccion", "address", "domicilio", "calle", "street"],
  website: ["website", "web", "sitio web", "url", "sitio", "pagina web", "dominio", "domain"],
  ciudad: ["ciudad", "city", "localidad", "ubicacion", "location", "town", "municipio", "provincia"],
  rubro: ["rubro", "nicho", "industry", "sector", "categoria", "category", "giro", "activity", "category name"],
};

const EMAIL_IN_TEXT = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;

/** Detecta el separador más probable mirando la primera línea. */
function detectDelimiter(firstLine: string): string {
  const candidates = [",", ";", "\t", "|"];
  let best = ",";
  let bestCount = 0;
  for (const d of candidates) {
    const count = firstLine.split(d).length - 1;
    if (count > bestCount) {
      best = d;
      bestCount = count;
    }
  }
  return best;
}

/**
 * Convierte un texto delimitado (CSV, TSV…) en una matriz de celdas. Respeta
 * comillas, comillas escapadas y saltos de línea dentro de una celda.
 */
export function parseDelimited(text: string, delimiter?: string): string[][] {
  const clean = text.replace(/^﻿/, "");
  const firstLine = clean.split(/\r?\n/, 1)[0] ?? "";
  const sep = delimiter ?? detectDelimiter(firstLine);
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = "";
  let inQuotes = false;

  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (inQuotes) {
      if (ch === '"') {
        if (clean[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"' && cur.trim() === "") {
      inQuotes = true;
      cur = "";
    } else if (ch === sep) {
      row.push(cur);
      cur = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && clean[i + 1] === "\n") i++;
      row.push(cur);
      rows.push(row);
      row = [];
      cur = "";
    } else {
      cur += ch;
    }
  }
  if (cur !== "" || row.length) {
    row.push(cur);
    rows.push(row);
  }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
}

export interface MappedRows {
  rows: Partial<Prospect>[];
  /** Campos reconocidos en los encabezados (para mostrarlos al usuario). */
  detected: ContactField[];
  /** true cuando no había encabezados reconocibles y se dedujo la columna de correo. */
  headerless: boolean;
}

/** Mapea una matriz de celdas (con o sin encabezados) a contactos. */
export function mapRows(matrix: string[][]): MappedRows {
  if (matrix.length === 0) return { rows: [], detected: [], headerless: false };
  // Un encabezado nunca contiene un correo: si la primera fila lo tiene, son datos.
  const firstIsData = matrix[0].some((cell) => EMAIL_IN_TEXT.test(cell));
  const headers = firstIsData ? [] : matrix[0].map(normalizeHeader);

  const used = new Set<number>();
  const exactIdx = (names: string[]) => {
    for (const n of names) {
      const exact = headers.indexOf(normalizeHeader(n));
      if (exact >= 0 && !used.has(exact)) return exact;
    }
    return -1;
  };
  const partialIdx = (names: string[]) => {
    for (const n of names) {
      const target = normalizeHeader(n);
      // Alias cortos o ambiguos («tel» en «hotel», «title» en «job title») solo por coincidencia exacta.
      if (target.length < 4 || target === "title") continue;
      const partial = headers.findIndex(
        (h, i) => !used.has(i) && h.length > 2 && (h.includes(target) || target.includes(h))
      );
      if (partial >= 0) return partial;
    }
    return -1;
  };

  // Primero todas las coincidencias exactas y después las parciales, en este
  // orden: «nombre» va al final para que «name» no capture «categoryName».
  const order: ContactField[] = ["correo", "whatsapp", "telefono", "website", "empresa", "rubro", "ciudad", "direccion", "nombre"];
  const cols = Object.fromEntries(order.map((f) => [f, -1])) as Record<ContactField, number>;
  for (const finder of [exactIdx, partialIdx]) {
    for (const field of order) {
      if (cols[field] >= 0) continue;
      const i = finder(ALIASES[field]);
      if (i >= 0) {
        cols[field] = i;
        used.add(i);
      }
    }
  }

  let body = matrix.slice(1);
  let headerless = false;
  const detected = order.filter((f) => cols[f] >= 0);

  // Sin columna de correo reconocible: se busca la que contiene correos.
  if (cols.correo < 0) {
    const width = Math.max(...matrix.map((r) => r.length));
    let bestCol = -1;
    let bestHits = 0;
    for (let c = 0; c < width; c++) {
      const hits = matrix.filter((r) => EMAIL_IN_TEXT.test(r[c] ?? "")).length;
      if (hits > bestHits) {
        bestHits = hits;
        bestCol = c;
      }
    }
    if (bestCol >= 0) {
      cols.correo = bestCol;
      // Si la primera fila ya es un dato, no había encabezados.
      if (firstIsData) {
        body = matrix;
        headerless = true;
        // Sin encabezados: la primera columna de texto distinta del correo se usa como empresa.
        const textCol = matrix[0].findIndex((cell, c) => c !== bestCol && cell.trim() && !EMAIL_IN_TEXT.test(cell));
        if (textCol >= 0) cols.empresa = textCol;
      }
      if (!detected.includes("correo")) detected.unshift("correo");
    }
  }

  const get = (row: string[], i: number) => (i >= 0 ? (row[i] ?? "").trim() : "");
  const rows = body.map((row) => {
    const rawEmail = get(row, cols.correo);
    // Celdas con varios correos («a@x.com; b@x.com»): se toma el primero.
    const email = rawEmail.match(EMAIL_IN_TEXT)?.[0] ?? rawEmail;
    return {
      nombre: get(row, cols.nombre),
      empresa: get(row, cols.empresa),
      correo: email.toLowerCase(),
      telefono: get(row, cols.telefono),
      whatsapp: get(row, cols.whatsapp),
      direccion: get(row, cols.direccion),
      website: get(row, cols.website),
      ciudad: get(row, cols.ciudad),
      rubro: get(row, cols.rubro),
    };
  });
  return { rows, detected, headerless };
}

export function parseCsv(text: string): Partial<Prospect>[] {
  const matrix = parseDelimited(text);
  if (matrix.length < 2 && !(matrix.length === 1 && EMAIL_IN_TEXT.test(matrix[0].join(" ")))) return [];
  return mapRows(matrix).rows;
}

/**
 * Texto pegado: acepta una tabla con encabezados o una lista libre de correos
 * («Ana <ana@acme.com>», «Acme, ventas@acme.com», uno por línea…).
 */
export function parsePastedContacts(text: string): MappedRows {
  const trimmed = text.trim();
  if (!trimmed) return { rows: [], detected: [], headerless: true };
  const matrix = parseDelimited(trimmed);
  const mapped = mapRows(matrix);
  if (!mapped.headerless && mapped.detected.length > 1) return mapped;

  const rows: Partial<Prospect>[] = [];
  const re = new RegExp(EMAIL_IN_TEXT.source, "gi");
  for (const line of trimmed.split(/\r?\n/)) {
    const emails = line.match(re) ?? [];
    if (emails.length === 0) continue;
    const label = line
      .replace(re, "")
      .replace(/[<>()"[\]]/g, " ")
      .replace(/[,;\t|]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    for (const email of emails) {
      rows.push({ empresa: label, nombre: "", correo: email.toLowerCase() });
    }
  }
  return { rows, detected: ["correo"], headerless: true };
}
