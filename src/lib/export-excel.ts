import type { Prospect } from "./types";

interface ColumnDef {
  header: string;
  value: (p: Prospect) => string | number;
  min?: number;
  max?: number;
  numeric?: boolean;
}

const SOCIAL_HEADERS: { key: keyof NonNullable<Prospect["social"]>; header: string }[] = [
  { key: "instagram", header: "Instagram" },
  { key: "linkedin", header: "LinkedIn" },
  { key: "facebook", header: "Facebook" },
  { key: "twitter", header: "Twitter / X" },
  { key: "whatsapp", header: "WhatsApp (Red Social)" },
  { key: "youtube", header: "YouTube" },
  { key: "tiktok", header: "TikTok" },
];

export const EXPORT_COLUMNS: ColumnDef[] = [
  { header: "Nombre", value: (p) => p.nombre || "" },
  { header: "Empresa", value: (p) => p.empresa || "" },
  { header: "Teléfono", value: (p) => p.telefono || "" },
  { header: "Email", value: (p) => p.correo || "" },
  { header: "Estado Email (MX)", value: (p) => p.emailStatusLabel ?? "Sin verificar" },
  { header: "Sitio Web", value: (p) => p.website || "" },
  { header: "Dirección", value: (p) => p.direccion || "" },
  { header: "Ciudad", value: (p) => p.ciudad || "" },
  { header: "Rubro", value: (p) => p.rubro || "" },
  ...SOCIAL_HEADERS.map(({ key, header }) => ({
    header,
    value: (p: Prospect) => p.social?.[key] ?? "",
  })),
  {
    header: "Stack Tecnológico Detectado",
    value: (p) =>
      (p.techStack ?? [])
        .filter((t) => t.id !== "ssl")
        .map((t) => t.name)
        .join(", "),
  },
  {
    header: "Certificado SSL",
    value: (p) =>
      typeof p.techSsl === "boolean" ? (p.techSsl ? "Sí" : "No") : "Sin analizar",
    min: 12,
  },
  { header: "Servidor Web", value: (p) => p.techServer ?? "" },
  {
    header: "Score Oportunidad Web",
    value: (p) => p.webOpportunity?.score ?? "",
    min: 12,
    numeric: true,
  },
  { header: "Nivel Oportunidad Web", value: (p) => p.webOpportunity?.label ?? "Sin análisis" },
  {
    header: "Observaciones Oportunidad",
    value: (p) => (p.webOpportunity?.reasons ?? []).join(" | "),
    min: 24,
    max: 70,
  },
  { header: "Enriquecido", value: (p) => (p.enriched ? "Sí" : "No") },
];

function columnLetter(index: number): string {
  let letters = "";
  let n = index;
  while (n > 0) {
    const remainder = (n - 1) % 26;
    letters = String.fromCharCode(65 + remainder) + letters;
    n = Math.floor((n - 1) / 26);
  }
  return letters;
}

function autoWidth(header: string, values: (string | number)[], min = 12, max = 50): number {
  let longest = header.length;
  for (const value of values) {
    const len = String(value ?? "").length;
    if (len > longest) longest = len;
  }
  return Math.min(Math.max(longest + 2, min), max);
}

function stamp(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(
    d.getMinutes()
  )}`;
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export async function buildProspectsWorkbook(prospects: Prospect[]) {
  const { Workbook } = await import("exceljs");
  const workbook = new Workbook();
  workbook.creator = "Suite de Prospección B2B";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet("Prospectos", {
    views: [{ state: "frozen", ySplit: 1 }],
    properties: { defaultRowHeight: 18 },
  });

  const matrix = prospects.map((p) => EXPORT_COLUMNS.map((col) => col.value(p)));

  sheet.columns = EXPORT_COLUMNS.map((col, i) => ({
    header: col.header,
    key: `c${i}`,
    width: autoWidth(col.header, matrix.map((row) => row[i]), col.min ?? 12, col.max ?? 50),
    style: { alignment: { vertical: "middle", wrapText: false } },
  }));

  const headerRow = sheet.getRow(1);
  headerRow.height = 26;
  headerRow.eachCell((cell, colNumber) => {
    const col = EXPORT_COLUMNS[colNumber - 1];
    cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F172A" } };
    cell.alignment = {
      vertical: "middle",
      horizontal: col?.numeric ? "center" : "left",
    };
    cell.border = {
      top: { style: "thin", color: { argb: "FF334155" } },
      left: { style: "thin", color: { argb: "FF334155" } },
      bottom: { style: "thin", color: { argb: "FF334155" } },
      right: { style: "thin", color: { argb: "FF334155" } },
    };
  });

  prospects.forEach((p, rowIndex) => {
    const row = sheet.addRow(EXPORT_COLUMNS.map((col) => col.value(p)));
    row.height = 18;
    row.eachCell((cell, colNumber) => {
      cell.border = {
        bottom: { style: "hair", color: { argb: "FFE2E8F0" } },
      };
      cell.alignment = { vertical: "middle" };
      if (rowIndex % 2 === 1) {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF1F5F9" } };
      }
      const col = EXPORT_COLUMNS[colNumber - 1];
      if (col?.numeric) cell.alignment = { vertical: "middle", horizontal: "center" };
    });
  });

  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: EXPORT_COLUMNS.length },
  };

  applyConditionalFormatting(sheet, prospects.length);

  return workbook;
}

function applyConditionalFormatting(
  sheet: import("exceljs").Worksheet,
  prospectCount: number
): void {
  if (prospectCount === 0) return;

  const sslIndex = EXPORT_COLUMNS.findIndex((col) => col.header === "Certificado SSL");
  const scoreIndex = EXPORT_COLUMNS.findIndex((col) => col.header === "Score Oportunidad Web");
  if (sslIndex < 0 && scoreIndex < 0) return;

  const lastRow = prospectCount + 1;
  const green = {
    font: { color: { argb: "FF047857" }, bold: true },
    fill: { type: "pattern" as const, pattern: "solid" as const, bgColor: { argb: "FFD1FAE5" } },
  };
  const red = {
    font: { color: { argb: "FFB91C1C" }, bold: true },
    fill: { type: "pattern" as const, pattern: "solid" as const, bgColor: { argb: "FFFEE2E2" } },
  };

  if (sslIndex >= 0) {
    const col = columnLetter(sslIndex + 1);
    sheet.addConditionalFormatting({
      ref: `${col}2:${col}${lastRow}`,
      rules: [
        {
          type: "expression",
          priority: 1,
          formulae: [`EXACT(${col}2,"Sí")`],
          style: green,
        },
        {
          type: "expression",
          priority: 2,
          formulae: [`EXACT(${col}2,"No")`],
          style: red,
        },
      ],
    });
  }

  if (scoreIndex >= 0) {
    const col = columnLetter(scoreIndex + 1);
    sheet.addConditionalFormatting({
      ref: `${col}2:${col}${lastRow}`,
      rules: [
        {
          type: "expression",
          priority: 1,
          formulae: [`AND(ISNUMBER(${col}2),${col}2>=55)`],
          style: green,
        },
        {
          type: "expression",
          priority: 2,
          formulae: [`AND(ISNUMBER(${col}2),${col}2<25)`],
          style: red,
        },
      ],
    });
  }
}

export async function exportProspectsToExcel(
  prospects: Prospect[],
  filename = `prospectos-${stamp()}.xlsx`
): Promise<void> {
  if (prospects.length === 0) return;
  const workbook = await buildProspectsWorkbook(prospects);
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer as ArrayBuffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  triggerDownload(blob, filename);
}
