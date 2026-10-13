import { mapRows, parseDelimited, type ContactField, type MappedRows } from "./csv";
import { isValidEmail } from "./sanitize";
import type { Prospect } from "./types";

export const IMPORT_ACCEPT =
  ".csv,.tsv,.txt,.xlsx,text/csv,text/plain,text/tab-separated-values,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export const MAX_IMPORT_BYTES = 15 * 1024 * 1024;

export const FIELD_LABELS: Record<ContactField, string> = {
  nombre: "Nombre",
  empresa: "Empresa",
  correo: "Correo",
  telefono: "Teléfono",
  whatsapp: "WhatsApp",
  direccion: "Dirección",
  website: "Sitio web",
  ciudad: "Ciudad",
  rubro: "Rubro",
};

function readAs(file: File, kind: "text" | "buffer", encoding?: string): Promise<string | ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result ?? "");
    reader.onerror = () => reject(reader.error ?? new Error("No se pudo leer el archivo."));
    if (kind === "buffer") reader.readAsArrayBuffer(file);
    else reader.readAsText(file, encoding);
  });
}

/** Lee texto en UTF-8 y, si trae caracteres rotos, reintenta en Windows-1252 (CSV de Excel en Windows). */
async function readText(file: File): Promise<string> {
  const utf8 = String(await readAs(file, "text"));
  if (!utf8.includes("�")) return utf8;
  try {
    return String(await readAs(file, "text", "windows-1252"));
  } catch {
    return utf8;
  }
}

function cellText(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "object") {
    const v = value as { text?: unknown; hyperlink?: string; result?: unknown; richText?: { text: string }[] };
    if (Array.isArray(v.richText)) return v.richText.map((r) => r.text).join("");
    if (typeof v.text === "string") return v.text;
    if (v.text && typeof v.text === "object") return cellText(v.text);
    if (v.result !== undefined) return cellText(v.result);
    if (typeof v.hyperlink === "string") return v.hyperlink.replace(/^mailto:/i, "");
  }
  return String(value);
}

async function readXlsx(file: File): Promise<string[][]> {
  const buffer = (await readAs(file, "buffer")) as ArrayBuffer;
  const { Workbook } = await import("exceljs");
  const wb = new Workbook();
  await wb.xlsx.load(buffer);
  // Se usa la hoja con más filas (los libros suelen traer hojas de resumen vacías).
  let best: string[][] = [];
  wb.eachSheet((sheet) => {
    const matrix: string[][] = [];
    sheet.eachRow({ includeEmpty: false }, (row) => {
      const values = Array.isArray(row.values) ? row.values.slice(1) : [];
      const cells = values.map((v) => cellText(v).trim());
      if (cells.some(Boolean)) matrix.push(cells);
    });
    if (matrix.length > best.length) best = matrix;
  });
  return best;
}

export interface ImportedFile extends MappedRows {
  fileName: string;
}

export async function readContactsFile(file: File): Promise<ImportedFile> {
  if (file.size > MAX_IMPORT_BYTES) {
    throw new Error("El archivo supera 15 MB. Divídelo en partes más pequeñas.");
  }
  const name = file.name.toLowerCase();
  if (/\.xls$/.test(name)) {
    throw new Error("Formato .xls antiguo no compatible: ábrelo en Excel y guárdalo como .xlsx o .csv.");
  }
  if (/\.xlsx$/.test(name) || file.type.includes("spreadsheetml")) {
    let matrix: string[][];
    try {
      matrix = await readXlsx(file);
    } catch {
      throw new Error("No se pudo leer el Excel. Comprueba que el archivo no esté protegido con contraseña.");
    }
    return { ...mapRows(matrix), fileName: file.name };
  }
  if (!/\.(csv|tsv|txt)$/.test(name) && file.type && !/csv|text|tab-separated/.test(file.type)) {
    throw new Error("Formato no compatible. Usa un archivo Excel (.xlsx), CSV o TXT.");
  }
  const text = await readText(file);
  return { ...mapRows(parseDelimited(text)), fileName: file.name };
}

export interface ImportSplit {
  /** Contactos con correo válido: listos para la campaña. */
  withEmail: Prospect[];
  /** Sin correo pero con sitio web: el Buscador puede encontrar su correo. */
  findable: Prospect[];
  /** Filas sin correo ni sitio web. */
  discarded: number;
}

/** Convierte filas importadas en prospectos y las separa según su utilidad. */
export function toProspects(rows: Partial<Prospect>[], source = "import"): ImportSplit {
  const stamp = Date.now().toString(36);
  const withEmail: Prospect[] = [];
  const findable: Prospect[] = [];
  const seen = new Set<string>();
  let discarded = 0;

  rows.forEach((r, i) => {
    const correo = (r.correo ?? "").trim().toLowerCase();
    const website = (r.website ?? "").trim();
    const prospect: Prospect = {
      id: `${source}-${stamp}-${i}`,
      nombre: (r.nombre ?? "").trim(),
      empresa: (r.empresa ?? "").trim() || "Sin empresa",
      correo: isValidEmail(correo) ? correo : "",
      telefono: (r.telefono ?? "").trim(),
      whatsapp: (r.whatsapp ?? "").trim() || (r.telefono ?? "").trim(),
      direccion: (r.direccion ?? "").trim(),
      website,
      ciudad: (r.ciudad ?? "").trim(),
      rubro: (r.rubro ?? "").trim(),
    };
    if (prospect.correo) {
      if (seen.has(prospect.correo)) return;
      seen.add(prospect.correo);
      withEmail.push(prospect);
    } else if (/\.[a-z]{2,}/i.test(website)) {
      const key = website.toLowerCase().replace(/^https?:\/\/(www\.)?/, "").replace(/\/.*$/, "");
      if (seen.has(key)) return;
      seen.add(key);
      findable.push(prospect);
    } else {
      discarded++;
    }
  });
  return { withEmail, findable, discarded };
}
