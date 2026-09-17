"use client";

import { useCallback, useState } from "react";
import { useAppState } from "./app-state";
import { formatPhoneForWa, mapsUrl } from "@/lib/format";
import { exportProspectsToExcel } from "@/lib/export-excel";
import { downloadProspectReport, previewProspectReport } from "@/lib/export-pdf";
import { SocialBadges } from "./social-icons";
import type { EmailValidationStatus, Prospect } from "@/lib/types";
import type {
  DetectedTech,
  OpportunityLevel,
  TechCategory,
  WebOpportunity,
} from "@/lib/tech-detector";

const STATUS_STYLES: Record<EmailValidationStatus, string> = {
  valid: "border-emerald-500/40 bg-emerald-500/15 text-emerald-300",
  risky: "border-amber-500/40 bg-amber-500/15 text-amber-300",
  invalid: "border-rose-500/40 bg-rose-500/15 text-rose-300",
  unknown: "border-slate-600/50 bg-slate-700/30 text-slate-400",
};

const STATUS_DOT: Record<EmailValidationStatus, string> = {
  valid: "bg-emerald-400",
  risky: "bg-amber-400",
  invalid: "bg-rose-400",
  unknown: "bg-slate-500",
};

const CATEGORY_STYLES: Record<TechCategory, string> = {
  cms: "border-violet-500/40 bg-violet-500/10 text-violet-300",
  analytics: "border-sky-500/40 bg-sky-500/10 text-sky-300",
  ecommerce: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
  infrastructure: "border-slate-600/50 bg-slate-700/30 text-slate-300",
};

const CATEGORY_LABELS: Record<TechCategory, string> = {
  cms: "CMS / Framework",
  analytics: "Analítica / Marketing",
  ecommerce: "E-commerce / Pagos",
  infrastructure: "Infraestructura / Seguridad",
};

const OPPORTUNITY_STYLES: Record<OpportunityLevel, string> = {
  alta: "border-amber-500/50 bg-amber-500/15 text-amber-300",
  media: "border-sky-500/40 bg-sky-500/15 text-sky-300",
  baja: "border-slate-600/50 bg-slate-700/30 text-slate-400",
};

function TechBadges({ tech, ssl }: { tech?: DetectedTech[]; ssl?: boolean }) {
  const items = tech ?? [];
  if (items.length === 0 && ssl !== false) {
    return <span className="text-xs text-slate-600">—</span>;
  }
  return (
    <div className="flex max-w-[320px] flex-wrap items-center gap-1">
      {ssl === false && (
        <span className="rounded-full border border-rose-500/40 bg-rose-500/15 px-2 py-0.5 text-[10px] font-semibold text-rose-300">
          Sin SSL
        </span>
      )}
      {items.map((item) => (
        <span
          key={item.id}
          title={CATEGORY_LABELS[item.category]}
          className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${CATEGORY_STYLES[item.category]}`}
        >
          {item.name}
        </span>
      ))}
    </div>
  );
}

function IconExcel() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5" />
      <path d="m9.5 12 5 5m0-5-5 5" />
    </svg>
  );
}

function IconPdf() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5" />
      <path d="M8.5 13h1.2a1.3 1.3 0 0 1 0 2.6H8.5V13zm0 2.6V18" />
      <path d="M13 13h1a2 2 0 0 1 2 2v1a2 2 0 0 1-2 2h-1z" />
    </svg>
  );
}

function IconEye() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function OpportunityBadge({ opportunity }: { opportunity?: WebOpportunity }) {
  if (!opportunity) return <span className="text-xs text-slate-600">—</span>;
  return (
    <span
      title={opportunity.reasons.length ? opportunity.reasons.join("\n") : "Sin observaciones"}
      className={`inline-flex flex-col items-start gap-0.5 rounded-lg border px-2 py-1 text-[11px] font-semibold ${OPPORTUNITY_STYLES[opportunity.level]}`}
    >
      <span>{opportunity.label}</span>
      <span className="text-[10px] font-normal opacity-80">{opportunity.score}/100</span>
    </span>
  );
}

interface EnrichResult {
  id: string;
  emails: string[];
  bestEmail: string;
  social: Prospect["social"];
  phoneDisplay: string;
  phoneDigits: string;
  emailStatus: EmailValidationStatus;
  emailStatusLabel: string;
  emailReason: string;
  hasMx: boolean;
  disposable: boolean;
  enriched: boolean;
  techStack?: DetectedTech[];
  techSsl?: boolean;
  techServer?: string | null;
  webOpportunity?: WebOpportunity | null;
}

async function requestEnrichment(
  items: Prospect[]
): Promise<{ ok: boolean; results: EnrichResult[]; message?: string }> {
  try {
    const res = await fetch("/api/enrich", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items: items.map((p) => ({
          id: p.id,
          website: p.website,
          correo: p.correo,
          telefono: p.telefono,
        })),
      }),
    });
    const data = await res.json();
    if (!res.ok || data?.success !== true) {
      return { ok: false, results: [], message: data?.message ?? "No se pudo enriquecer." };
    }
    return { ok: true, results: Array.isArray(data.results) ? data.results : [] };
  } catch {
    return { ok: false, results: [], message: "Error de conexión al enriquecer." };
  }
}

function buildPatch(current: Prospect, result: EnrichResult): Partial<Prospect> {
  const patch: Partial<Prospect> = {
    emails: result.emails.length ? result.emails : current.emails,
    social:
      result.social && Object.keys(result.social).length ? result.social : current.social,
    emailStatus: result.emailStatus,
    emailStatusLabel: result.emailStatusLabel,
    emailReason: result.emailReason,
    enriched: true,
  };
  if (result.bestEmail) patch.correo = result.bestEmail;
  if (result.phoneDigits && (!current.whatsapp || current.telefono === "No disponible")) {
    patch.whatsapp = result.phoneDigits;
    patch.telefono = result.phoneDisplay || current.telefono;
  }
  if (result.techStack) patch.techStack = result.techStack;
  if (typeof result.techSsl === "boolean") patch.techSsl = result.techSsl;
  if (result.techServer !== undefined) patch.techServer = result.techServer;
  if (result.webOpportunity) patch.webOpportunity = result.webOpportunity;
  return patch;
}

export function ResultsTable() {
  const { prospects, selectedIds, toggleSelect, selectAll, updateProspects } = useAppState();
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [bulkLoading, setBulkLoading] = useState(false);
  const [exporting, setExporting] = useState<null | "excel" | "pdf" | "preview">(null);
  const [notice, setNotice] = useState<string | null>(null);

  const selectedSet = new Set(selectedIds);
  const allSelected = prospects.length > 0 && selectedIds.length === prospects.length;

  const runEnrichment = useCallback(
    async (targets: Prospect[]) => {
      const list = targets.filter((p) => p.website);
      if (list.length === 0) {
        setNotice("Ninguno de los prospectos seleccionados tiene sitio web para re-escanear.");
        return;
      }
      setNotice(null);
      const ids = list.map((p) => p.id);
      setBusy((prev) => {
        const next = { ...prev };
        for (const id of ids) next[id] = true;
        return next;
      });

      const updates: Record<string, Partial<Prospect>> = {};
      let enrichedCount = 0;
      const chunkSize = 8;
      let failure: string | null = null;

      for (let i = 0; i < list.length; i += chunkSize) {
        const chunk = list.slice(i, i + chunkSize);
        const { ok, results, message } = await requestEnrichment(chunk);
        if (!ok) {
          failure = message ?? "No se pudo enriquecer.";
          continue;
        }
        for (const result of results) {
          const current = list.find((p) => p.id === result.id);
          if (!current) continue;
          updates[result.id] = buildPatch(current, result);
          if (result.enriched) enrichedCount++;
        }
      }

      if (Object.keys(updates).length > 0) updateProspects(updates);

      setBusy((prev) => {
        const next = { ...prev };
        for (const id of ids) delete next[id];
        return next;
      });

      if (failure) {
        setNotice(failure);
      } else if (enrichedCount > 0) {
        setNotice(`Contactos enriquecidos: ${enrichedCount} de ${list.length}.`);
      } else {
        setNotice("No se encontraron datos nuevos en los sitios web analizados.");
      }
    },
    [updateProspects]
  );

  async function enrichAll() {
    const targets = selectedIds.length > 0 ? prospects.filter((p) => selectedSet.has(p.id)) : prospects;
    setBulkLoading(true);
    try {
      await runEnrichment(targets);
    } finally {
      setBulkLoading(false);
    }
  }

  const exportTargets =
    selectedIds.length > 0 ? prospects.filter((p) => selectedSet.has(p.id)) : prospects;

  async function handleExportExcel() {
    if (exportTargets.length === 0 || exporting) return;
    setExporting("excel");
    setNotice(null);
    try {
      await exportProspectsToExcel(exportTargets);
      setNotice(`Excel exportado con ${exportTargets.length} prospecto(s).`);
    } catch {
      setNotice("No se pudo generar el archivo Excel.");
    } finally {
      setExporting(null);
    }
  }

  async function handleReport(mode: "pdf" | "preview") {
    if (exportTargets.length === 0 || exporting) return;
    setExporting(mode);
    setNotice(null);
    try {
      if (mode === "pdf") {
        await downloadProspectReport(exportTargets);
        setNotice(`Reporte PDF descargado (${exportTargets.length} prospecto(s)).`);
      } else {
        await previewProspectReport(exportTargets);
        setNotice("Vista previa del reporte PDF abierta en una nueva pestaña.");
      }
    } catch {
      setNotice("No se pudo generar el reporte PDF.");
    } finally {
      setExporting(null);
    }
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-800 bg-[#0f172a]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 px-4 py-3">
        <p className="text-xs text-slate-500">
          Enriquecimiento profundo con validación MX/DNS, redes sociales, detector de stack web y
          oportunidad para agencia.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleExportExcel}
            disabled={Boolean(exporting) || prospects.length === 0}
            title="Exportar los prospectos seleccionados (o todos) a Excel .xlsx"
            className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-600/50 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-300 transition hover:bg-emerald-500/20 disabled:opacity-50"
          >
            <IconExcel />
            {exporting === "excel" ? "Generando…" : "Exportar a Excel (.xlsx)"}
          </button>
          <button
            type="button"
            onClick={() => void handleReport("preview")}
            disabled={Boolean(exporting) || prospects.length === 0}
            title="Ver el reporte PDF en una nueva pestaña"
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-300 transition hover:bg-slate-800 hover:text-slate-100 disabled:opacity-50"
          >
            <IconEye />
            {exporting === "preview" ? "Generando…" : "Vista Previa PDF"}
          </button>
          <button
            type="button"
            onClick={() => void handleReport("pdf")}
            disabled={Boolean(exporting) || prospects.length === 0}
            title="Descargar el reporte de prospección en PDF"
            className="inline-flex items-center gap-1.5 rounded-lg border border-rose-600/50 bg-rose-500/10 px-3 py-1.5 text-xs font-semibold text-rose-300 transition hover:bg-rose-500/20 disabled:opacity-50"
          >
            <IconPdf />
            {exporting === "pdf" ? "Generando…" : "Descargar Reporte PDF"}
          </button>
          <button
            type="button"
            onClick={enrichAll}
            disabled={bulkLoading}
            className="rounded-lg border border-sky-600/50 bg-sky-500/10 px-3 py-1.5 text-xs font-semibold text-sky-300 transition hover:bg-sky-500/20 disabled:opacity-50"
          >
            {bulkLoading
              ? "Enriqueciendo…"
              : `Enriquecer Contactos${selectedIds.length > 0 ? ` (${selectedIds.length})` : ""}`}
          </button>
        </div>
      </div>

      {notice && (
        <div className="border-b border-slate-800 bg-slate-900/50 px-4 py-2 text-xs text-slate-400">
          {notice}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[1560px] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-slate-800 text-xs uppercase tracking-wide text-slate-500">
              <th className="w-10 px-4 py-3">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={selectAll}
                  className="h-4 w-4 accent-sky-500"
                  aria-label="Seleccionar todo"
                />
              </th>
              <th className="px-3 py-3 font-medium">Empresa</th>
              <th className="px-3 py-3 font-medium">Correo</th>
              <th className="px-3 py-3 font-medium">Teléfono</th>
              <th className="px-3 py-3 font-medium">Redes Sociales</th>
              <th className="px-3 py-3 font-medium">WhatsApp</th>
              <th className="px-3 py-3 font-medium">Dirección</th>
              <th className="px-3 py-3 font-medium">Sitio Web</th>
              <th className="px-3 py-3 font-medium">Tecnologías</th>
              <th className="px-3 py-3 font-medium">Oportunidad Web</th>
              <th className="px-3 py-3 font-medium">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {prospects.map((p) => {
              const sel = selectedSet.has(p.id);
              const status = p.emailStatus ?? "unknown";
              return (
                <tr
                  key={p.id}
                  onClick={() => toggleSelect(p.id)}
                  className={`cursor-pointer border-b border-slate-800/60 transition-colors ${
                    sel ? "bg-sky-500/5" : "hover:bg-slate-800/40"
                  }`}
                >
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={sel}
                      readOnly
                      className="pointer-events-none h-4 w-4 accent-sky-500"
                      aria-label={`Seleccionar ${p.empresa}`}
                    />
                  </td>
                  <td className="px-3 py-3 font-medium text-slate-100">{p.empresa}</td>
                  <td className="px-3 py-3">
                    <div className="flex flex-col items-start gap-1.5">
                      <span className="text-slate-300">{p.correo}</span>
                      <span
                        title={p.emailReason || "Correo no verificado"}
                        className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium ${STATUS_STYLES[status]}`}
                      >
                        <span className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[status]}`} />
                        {p.emailStatusLabel ?? "Sin verificar"}
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-3 text-slate-300">{p.telefono}</td>
                  <td className="px-3 py-3">
                    <SocialBadges social={p.social} />
                  </td>
                  <td className="px-3 py-3">
                    {p.whatsapp ? (
                      <a
                        href={`https://wa.me/${formatPhoneForWa(p.whatsapp)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500/15 px-2.5 py-1 text-xs font-medium text-emerald-300 transition hover:bg-emerald-500/25"
                      >
                        WhatsApp
                      </a>
                    ) : (
                      <span className="text-xs text-slate-600">—</span>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    <a
                      href={mapsUrl(p.direccion)}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-slate-700/40 px-2.5 py-1 text-xs font-medium text-slate-300 transition hover:bg-slate-700/70"
                    >
                      Mapa
                    </a>
                  </td>
                  <td className="px-3 py-3">
                    {p.website ? (
                      <a
                        href={p.website}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="text-sky-400 hover:underline"
                      >
                        {p.website.replace(/^https?:\/\//, "").slice(0, 34)}
                      </a>
                    ) : (
                      <span className="text-xs text-slate-600">No disponible</span>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    <TechBadges tech={p.techStack} ssl={p.techSsl} />
                  </td>
                  <td className="px-3 py-3">
                    <OpportunityBadge opportunity={p.webOpportunity} />
                  </td>
                  <td className="px-3 py-3">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        void runEnrichment([p]);
                      }}
                      disabled={!p.website || Boolean(busy[p.id])}
                      title={p.website ? "Re-escanear el sitio web" : "Sin sitio web para analizar"}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 px-2.5 py-1 text-xs font-medium text-slate-300 transition hover:bg-slate-800 hover:text-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {busy[p.id] ? "Analizando…" : "Enriquecer Contactos"}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
