import type { Prospect } from "./types";

export interface AuditStats {
  total: number;
  withWebsite: number;
  websitePct: number;
  sslCount: number;
  sslPct: number;
  socialCount: number;
  socialPct: number;
  avgOpportunity: number;
  highOpportunityCount: number;
}

export interface ProspectReportOptions {
  title?: string;
  subtitle?: string;
  topCount?: number;
}

export function computeAuditStats(prospects: Prospect[]): AuditStats {
  const total = prospects.length;
  const pct = (n: number) => (total > 0 ? Math.round((n / total) * 100) : 0);

  const withWebsite = prospects.filter((p) => Boolean(p.website)).length;
  const sslCount = prospects.filter((p) => p.techSsl === true).length;
  const socialCount = prospects.filter((p) =>
    p.social ? Object.values(p.social).some(Boolean) : false
  ).length;

  const scored = prospects.filter((p) => typeof p.webOpportunity?.score === "number");
  const avgOpportunity =
    scored.length > 0
      ? Math.round(scored.reduce((sum, p) => sum + (p.webOpportunity?.score ?? 0), 0) / scored.length)
      : 0;
  const highOpportunityCount = prospects.filter((p) => p.webOpportunity?.level === "alta").length;

  return {
    total,
    withWebsite,
    websitePct: pct(withWebsite),
    sslCount,
    sslPct: pct(sslCount),
    socialCount,
    socialPct: pct(socialCount),
    avgOpportunity,
    highOpportunityCount,
  };
}

function formatDate(d: Date): string {
  return d.toLocaleDateString("es-ES", { day: "2-digit", month: "long", year: "numeric" });
}

function clean(value: string, max = 42): string {
  const v = (value ?? "").replace(/\s+/g, " ").trim();
  return v.length > max ? `${v.slice(0, max - 1)}…` : v;
}

function rankProspects(prospects: Prospect[]): Prospect[] {
  return [...prospects].sort((a, b) => {
    const sa = a.webOpportunity?.score;
    const sb = b.webOpportunity?.score;
    if (typeof sa === "number" && typeof sb === "number") return sb - sa;
    if (typeof sa === "number") return -1;
    if (typeof sb === "number") return 1;
    return a.empresa.localeCompare(b.empresa);
  });
}

export async function buildProspectReport(
  prospects: Prospect[],
  options: ProspectReportOptions = {}
) {
  const { jsPDF } = await import("jspdf");
  const { autoTable } = await import("jspdf-autotable");

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 14;
  const usable = pageWidth - margin * 2;

  const stats = computeAuditStats(prospects);
  const title = options.title ?? "Reporte de Prospección B2B";
  const subtitle =
    options.subtitle ??
    "Auditoría de presencia web, contacto y oportunidad comercial detectada.";
  const topCount = options.topCount ?? 12;

  // Header band
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, pageWidth, 34, "F");
  doc.setTextColor(56, 189, 248);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(19);
  doc.text(title, margin, 15);
  doc.setTextColor(226, 232, 240);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.text(subtitle, margin, 22);
  doc.setFontSize(8.5);
  doc.setTextColor(148, 163, 184);
  doc.text(`Generado: ${formatDate(new Date())}`, margin, 28.5);
  doc.text(`Total analizado: ${stats.total}`, pageWidth - margin, 28.5, { align: "right" });

  // KPI cards
  const kpis: { label: string; value: string }[] = [
    { label: "Total prospectos", value: String(stats.total) },
    { label: "% con sitio web", value: `${stats.websitePct}%` },
    { label: "% con SSL", value: `${stats.sslPct}%` },
    { label: "% con redes sociales", value: `${stats.socialPct}%` },
    { label: "Oportunidad promedio", value: `${stats.avgOpportunity}/100` },
  ];

  const gap = 4;
  const cardW = (usable - gap * (kpis.length - 1)) / kpis.length;
  const cardY = 44;
  const cardH = 22;
  kpis.forEach((kpi, i) => {
    const x = margin + i * (cardW + gap);
    doc.setFillColor(241, 245, 249);
    doc.setDrawColor(203, 213, 225);
    doc.roundedRect(x, cardY, cardW, cardH, 2, 2, "FD");
    doc.setTextColor(71, 85, 105);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.text(kpi.label, x + cardW / 2, cardY + 7, { align: "center", maxWidth: cardW - 4 });
    doc.setTextColor(15, 23, 42);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(15);
    doc.text(kpi.value, x + cardW / 2, cardY + 17, { align: "center" });
  });

  // Highlight line
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(100, 116, 139);
  doc.text(
    `${stats.withWebsite} de ${stats.total} con sitio web · ${stats.sslCount} con SSL · ` +
      `${stats.socialCount} con redes sociales · ${stats.highOpportunityCount} con oportunidad alta`,
    margin,
    cardY + cardH + 7
  );

  // Top prospects table
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(15, 23, 42);
  doc.text(`Top ${topCount} prospectos por oportunidad web`, margin, cardY + cardH + 17);

  const ranked = rankProspects(prospects).slice(0, topCount);
  const body = ranked.map((p, i) => [
    String(i + 1),
    clean(p.empresa, 30),
    clean(p.correo, 30),
    clean(p.telefono, 18),
    p.website ? clean(p.website.replace(/^https?:\/\//, "").replace(/\/$/, ""), 26) : "—",
    p.techSsl === true ? "Sí" : p.techSsl === false ? "No" : "—",
    p.webOpportunity ? `${p.webOpportunity.score}` : "—",
    p.webOpportunity?.label ?? "Sin análisis",
  ]);

  autoTable(doc, {
    startY: cardY + cardH + 21,
    head: [["#", "Empresa", "Correo", "Teléfono", "Sitio Web", "SSL", "Score", "Nivel"]],
    body,
    theme: "grid",
    styles: {
      font: "helvetica",
      fontSize: 7.6,
      cellPadding: 1.7,
      textColor: [30, 41, 59],
      lineColor: [226, 232, 240],
      lineWidth: 0.1,
      overflow: "linebreak",
    },
    headStyles: {
      fillColor: [15, 23, 42],
      textColor: [255, 255, 255],
      fontStyle: "bold",
      fontSize: 7.8,
      halign: "left",
    },
    alternateRowStyles: { fillColor: [241, 245, 249] },
    columnStyles: {
      0: { cellWidth: 8, halign: "center" },
      5: { cellWidth: 12, halign: "center" },
      6: { cellWidth: 14, halign: "center", fontStyle: "bold" },
      7: { cellWidth: 24 },
    },
    margin: { left: margin, right: margin, bottom: 20 },
  });

  const finalY =
    (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? cardY + 40;

  // Opportunity breakdown
  if (stats.highOpportunityCount > 0) {
    const detail = rankProspects(prospects).filter((p) => p.webOpportunity?.level === "alta");
    const startY = Math.min(finalY + 9, doc.internal.pageSize.getHeight() - 40);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(180, 83, 9);
    doc.text("Oportunidades de alta prioridad", margin, startY);

    autoTable(doc, {
      startY: startY + 3,
      head: [["Empresa", "Score", "Motivos detectados"]],
      body: detail
        .slice(0, 20)
        .map((p) => [
          clean(p.empresa, 28),
          String(p.webOpportunity?.score ?? ""),
          clean((p.webOpportunity?.reasons ?? []).join(" · ") || "—", 130),
        ]),
      theme: "striped",
      styles: {
        font: "helvetica",
        fontSize: 7.4,
        cellPadding: 1.6,
        textColor: [51, 65, 85],
        overflow: "linebreak",
      },
      headStyles: {
        fillColor: [180, 83, 9],
        textColor: [255, 255, 255],
        fontStyle: "bold",
        fontSize: 7.6,
      },
      columnStyles: {
        1: { cellWidth: 14, halign: "center", fontStyle: "bold" },
      },
      margin: { left: margin, right: margin, bottom: 20 },
    });
  }

  // Footer on every page
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    const h = doc.internal.pageSize.getHeight();
    doc.setDrawColor(226, 232, 240);
    doc.line(margin, h - 14, pageWidth - margin, h - 14);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(148, 163, 184);
    doc.text("Suite de Prospección B2B · Reporte confidencial", margin, h - 9);
    doc.text(`Página ${i} de ${pages}`, pageWidth - margin, h - 9, { align: "right" });
  }

  return doc;
}

function stamp(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(
    d.getMinutes()
  )}`;
}

export async function downloadProspectReport(
  prospects: Prospect[],
  options: ProspectReportOptions = {}
): Promise<void> {
  const doc = await buildProspectReport(prospects, options);
  doc.save(`reporte-prospeccion-${stamp()}.pdf`);
}

export async function previewProspectReport(
  prospects: Prospect[],
  options: ProspectReportOptions = {}
): Promise<void> {
  const doc = await buildProspectReport(prospects, options);
  const blobUrl = doc.output("bloburl");
  window.open(blobUrl as unknown as string, "_blank");
}
