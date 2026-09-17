"use client";

import { useCallback, useState, useSyncExternalStore } from "react";
import { useAppState } from "./app-state";
import { formatPhoneForWa, mapsUrl } from "@/lib/format";
import { mapLimit } from "@/lib/concurrency";
import {
  getProvidersSnapshot,
  getServerProvidersSnapshot,
  subscribeProviders,
  type ProviderConfig,
} from "@/lib/providers";
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

function IconTrash() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M3 6h18" />
      <path d="M8 6V4h8v2" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6M14 11v6" />
    </svg>
  );
}

function IconShieldCheck() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z" />
      <path d="m9 12 2 2 4-4" />
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

interface EnrichResponse {
  ok: boolean;
  results: EnrichResult[];
  message?: string;
}

interface EmailExtractResult {
  id: string;
  emails: string[];
  bestEmail: string;
  social?: Prospect["social"];
  emailStatus: EmailValidationStatus;
  emailStatusLabel: string;
  emailReason: string;
  source: "apify" | "html" | "none";
  techStack?: DetectedTech[];
  techSsl?: boolean;
  techServer?: string | null;
  webOpportunity?: WebOpportunity | null;
}

interface EmailExtractResponse {
  ok: boolean;
  results: EmailExtractResult[];
  usedApify?: boolean;
  message?: string;
}

interface ValidateResult {
  id: string;
  emailStatus: EmailValidationStatus;
  emailStatusLabel: string;
  emailReason: string;
  hasMx: boolean;
  disposable: boolean;
  catchAll: boolean;
}

interface ValidateResponse {
  ok: boolean;
  results: ValidateResult[];
  summary?: { valid: number; risky: number; invalid: number; unknown: number };
  message?: string;
}

interface Filters {
  selectedIds: string[];
  busy: Record<string, boolean>;
  exporting: null | "excel" | "pdf" | "preview";
}

async function requestEnrichment(items: Prospect[]): Promise<EnrichResponse> {
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

async function requestEmailExtraction(
  items: Prospect[],
  config: ProviderConfig
): Promise<EmailExtractResponse> {
  try {
    const res = await fetch("/api/enrich-emails", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items: items.map((p) => ({ id: p.id, website: p.website })),
        apifyToken: config.apifyToken,
        emailActor: config.emailActor,
      }),
    });
    const data = await res.json();
    if (!res.ok || data?.success !== true) {
      return {
        ok: false,
        results: [],
        message: data?.message ?? "No se pudieron extraer correos.",
      };
    }
    return {
      ok: true,
      results: Array.isArray(data.results) ? data.results : [],
      usedApify: data?.usedApify === true,
      message: typeof data?.message === "string" ? data.message : undefined,
    };
  } catch {
    return { ok: false, results: [], message: "Error de conexión al extraer correos." };
  }
}

async function requestValidation(items: Prospect[]): Promise<ValidateResponse> {
  try {
    const res = await fetch("/api/validate-emails", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items: items.map((p) => ({ id: p.id, correo: p.correo })),
      }),
    });
    const data = await res.json();
    if (!res.ok || data?.success !== true) {
      return { ok: false, results: [], message: data?.message ?? "No se pudieron validar los correos." };
    }
    return {
      ok: true,
      results: Array.isArray(data.results) ? data.results : [],
      summary: data?.summary,
    };
  } catch {
    return { ok: false, results: [], message: "Error de conexión al validar los correos." };
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
  const {
    prospects,
    selectedIds,
    toggleSelect,
    selectAll,
    updateProspects,
    setProspects,
    clearSelection,
  } = useAppState();
  const providerConfig = useSyncExternalStore(
    subscribeProviders,
    getProvidersSnapshot,
    getServerProvidersSnapshot
  );
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [bulkLoading, setBulkLoading] = useState(false);
  const [emailLoading, setEmailLoading] = useState(false);
  const [validating, setValidating] = useState(false);
  const [exporting, setExporting] = useState<Filters["exporting"]>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const selectedSet = new Set(selectedIds);
  const allSelected = prospects.length > 0 && selectedIds.length === prospects.length;
  const exportTargets =
    selectedIds.length > 0 ? prospects.filter((p) => selectedSet.has(p.id)) : prospects;

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

      const chunks: Prospect[][] = [];
      const chunkSize = 8;
      for (let i = 0; i < list.length; i += chunkSize) {
        chunks.push(list.slice(i, i + chunkSize));
      }

      const responses = await mapLimit(chunks, 4, (chunk) => requestEnrichment(chunk));
      const byId = new Map(list.map((prospect): [string, Prospect] => [prospect.id, prospect]));

      const updates: Record<string, Partial<Prospect>> = {};
      let enrichedCount = 0;
      let failure: string | null = null;

      for (const response of responses) {
        if (!response.ok) {
          failure = response.message ?? "No se pudo enriquecer.";
          continue;
        }
        for (const result of response.results) {
          const current = byId.get(result.id);
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
    const targets =
      selectedIds.length > 0 ? prospects.filter((p) => selectedSet.has(p.id)) : prospects;
    setBulkLoading(true);
    try {
      await runEnrichment(targets);
    } finally {
      setBulkLoading(false);
    }
  }

  const runEmailExtraction = useCallback(
    async (targets: Prospect[]) => {
      const list = targets.filter((p) => p.website);
      if (list.length === 0) {
        setNotice("Ninguno de los prospectos seleccionados tiene sitio web para escanear.");
        return;
      }
      setNotice(null);
      const ids = list.map((p) => p.id);
      setBusy((prev) => {
        const next = { ...prev };
        for (const id of ids) next[id] = true;
        return next;
      });

      const chunks: Prospect[][] = [];
      const chunkSize = 8;
      for (let i = 0; i < list.length; i += chunkSize) {
        chunks.push(list.slice(i, i + chunkSize));
      }

      const responses = await mapLimit(chunks, 4, (chunk) =>
        requestEmailExtraction(chunk, providerConfig)
      );

      const updates: Record<string, Partial<Prospect>> = {};
      let foundCount = 0;
      let failure: string | null = null;

      for (const response of responses) {
        if (!response.ok) {
          failure = response.message ?? "No se pudieron extraer correos.";
          continue;
        }
        if (response.message) failure = response.message;
        for (const result of response.results) {
          const patch: Partial<Prospect> = {
            emailStatus: result.emailStatus,
            emailStatusLabel: result.emailStatusLabel,
            emailReason: result.emailReason,
            enriched: true,
          };
          if (result.emails.length > 0) patch.emails = result.emails;
          if (result.social && Object.keys(result.social).length > 0) {
            patch.social = result.social;
          }
          if (result.bestEmail) {
            patch.correo = result.bestEmail;
            foundCount++;
          }
          if (result.techStack) patch.techStack = result.techStack;
          if (typeof result.techSsl === "boolean") patch.techSsl = result.techSsl;
          if (result.techServer !== undefined) patch.techServer = result.techServer;
          if (result.webOpportunity) patch.webOpportunity = result.webOpportunity;
          updates[result.id] = patch;
        }
      }

      if (Object.keys(updates).length > 0) updateProspects(updates);

      setBusy((prev) => {
        const next = { ...prev };
        for (const id of ids) delete next[id];
        return next;
      });

      if (foundCount > 0) {
        setNotice(`Correos extraídos y asignados: ${foundCount} de ${list.length}.`);
      } else if (failure) {
        setNotice(failure);
      } else {
        setNotice("No se encontraron correos en los sitios web analizados.");
      }
    },
    [providerConfig, updateProspects]
  );

  async function extractEmails() {
    const targets =
      selectedIds.length > 0 ? prospects.filter((p) => selectedSet.has(p.id)) : prospects;
    setEmailLoading(true);
    try {
      await runEmailExtraction(targets);
    } finally {
      setEmailLoading(false);
    }
  }

  const runValidation = useCallback(
    async (targets: Prospect[]) => {
      const list = targets.filter((p) => (p.correo ?? "").trim());
      if (list.length === 0) {
        setNotice("Ninguno de los prospectos seleccionados tiene correo para validar.");
        return;
      }
      setNotice(null);
      const ids = list.map((p) => p.id);
      setBusy((prev) => {
        const next = { ...prev };
        for (const id of ids) next[id] = true;
        return next;
      });

      try {
        const response = await requestValidation(list);
        if (!response.ok) {
          setNotice(response.message ?? "No se pudieron validar los correos.");
          return;
        }

        const updates: Record<string, Partial<Prospect>> = {};
        for (const result of response.results) {
          updates[result.id] = {
            emailStatus: result.emailStatus,
            emailStatusLabel: result.emailStatusLabel,
            emailReason: result.emailReason,
          };
        }
        if (Object.keys(updates).length > 0) updateProspects(updates);

        const summary = response.summary;
        if (summary) {
          setNotice(
            `Validación completada: ${summary.valid} válidos, ${summary.risky} riesgosos y ${summary.invalid} inválidos de ${list.length}.`
          );
        } else {
          setNotice(`Correos validados: ${Object.keys(updates).length} de ${list.length}.`);
        }
      } finally {
        setBusy((prev) => {
          const next = { ...prev };
          for (const id of ids) delete next[id];
          return next;
        });
      }
    },
    [updateProspects]
  );

  async function validateEmailsList() {
    const targets =
      selectedIds.length > 0 ? prospects.filter((p) => selectedSet.has(p.id)) : prospects;
    setValidating(true);
    try {
      await runValidation(targets);
    } finally {
      setValidating(false);
    }
  }

  function handleClearResults() {
    if (prospects.length === 0) return;
    const confirmed = window.confirm(
      "¿Vaciar la lista de resultados en pantalla? El historial guardado no se eliminará."
    );
    if (!confirmed) return;
    setProspects([]);
    clearSelection();
    setNotice("Lista de resultados vaciada. Puedes iniciar una nueva búsqueda.");
  }

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
      <ResultsToolbar
        exporting={exporting}
        bulkLoading={bulkLoading}
        emailLoading={emailLoading}
        validating={validating}
        hasProspects={prospects.length > 0}
        selectedCount={selectedIds.length}
        onExportExcel={handleExportExcel}
        onPreview={() => void handleReport("preview")}
        onDownload={() => void handleReport("pdf")}
        onEnrichAll={enrichAll}
        onExtractEmails={extractEmails}
        onValidateEmails={validateEmailsList}
        onClearResults={handleClearResults}
      />

      {notice && <NoticeBar notice={notice} />}

      <ProspectsTable
        prospects={prospects}
        selectedSet={selectedSet}
        allSelected={allSelected}
        busy={busy}
        onSelectAll={selectAll}
        onToggle={toggleSelect}
        onEnrich={(prospect) => void runEnrichment([prospect])}
        onValidate={(prospect) => void runValidation([prospect])}
      />
    </div>
  );
}

function ResultsToolbar({
  exporting,
  bulkLoading,
  emailLoading,
  validating,
  hasProspects,
  selectedCount,
  onExportExcel,
  onPreview,
  onDownload,
  onEnrichAll,
  onExtractEmails,
  onValidateEmails,
  onClearResults,
}: {
  exporting: Filters["exporting"];
  bulkLoading: boolean;
  emailLoading: boolean;
  validating: boolean;
  hasProspects: boolean;
  selectedCount: number;
  onExportExcel: () => void;
  onPreview: () => void;
  onDownload: () => void;
  onEnrichAll: () => void;
  onExtractEmails: () => void;
  onValidateEmails: () => void;
  onClearResults: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 px-4 py-3">
      <p className="text-xs text-slate-500">
        Enriquecimiento profundo con validación MX/DNS, redes sociales, detector de stack web y
        oportunidad para agencia.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onExportExcel}
          disabled={Boolean(exporting) || !hasProspects}
          title="Exportar los prospectos seleccionados (o todos) a Excel .xlsx"
          className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-600/50 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-300 transition hover:bg-emerald-500/20 disabled:opacity-50"
        >
          <IconExcel />
          {exporting === "excel" ? "Generando…" : "Exportar a Excel (.xlsx)"}
        </button>
        <button
          type="button"
          onClick={onPreview}
          disabled={Boolean(exporting) || !hasProspects}
          title="Ver el reporte PDF en una nueva pestaña"
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-300 transition hover:bg-slate-800 hover:text-slate-100 disabled:opacity-50"
        >
          <IconEye />
          {exporting === "preview" ? "Generando…" : "Vista Previa PDF"}
        </button>
        <button
          type="button"
          onClick={onDownload}
          disabled={Boolean(exporting) || !hasProspects}
          title="Descargar el reporte de prospección en PDF"
          className="inline-flex items-center gap-1.5 rounded-lg border border-rose-600/50 bg-rose-500/10 px-3 py-1.5 text-xs font-semibold text-rose-300 transition hover:bg-rose-500/20 disabled:opacity-50"
        >
          <IconPdf />
          {exporting === "pdf" ? "Generando…" : "Descargar Reporte PDF"}
        </button>
        <button
          type="button"
          onClick={onEnrichAll}
          disabled={bulkLoading}
          className="rounded-lg border border-sky-600/50 bg-sky-500/10 px-3 py-1.5 text-xs font-semibold text-sky-300 transition hover:bg-sky-500/20 disabled:opacity-50"
        >
          {bulkLoading
            ? "Enriqueciendo…"
            : `Enriquecer Contactos${selectedCount > 0 ? ` (${selectedCount})` : ""}`}
        </button>
        <button
          type="button"
          onClick={onExtractEmails}
          disabled={emailLoading || !hasProspects}
          title="Escanea las URLs de la columna Sitio Web con Apify (o el extractor HTML local) para extraer y completar correos"
          className="rounded-lg border border-amber-600/50 bg-amber-500/10 px-3 py-1.5 text-xs font-semibold text-amber-300 transition hover:bg-amber-500/20 disabled:opacity-50"
        >
          {emailLoading
            ? "Extrayendo correos…"
            : `Enriquecer / Extraer Correos de Sitios Web${
                selectedCount > 0 ? ` (${selectedCount})` : ""
              }`}
        </button>
        <button
          type="button"
          onClick={onValidateEmails}
          disabled={validating || !hasProspects}
          title="Valida sintaxis, registros MX/DNS y detecta dominios catch-all o desechables"
          className="inline-flex items-center gap-1.5 rounded-lg border border-teal-600/50 bg-teal-500/10 px-3 py-1.5 text-xs font-semibold text-teal-300 transition hover:bg-teal-500/20 disabled:opacity-50"
        >
          <IconShieldCheck />
          {validating
            ? "Validando…"
            : `Validar Correos (MX)${selectedCount > 0 ? ` (${selectedCount})` : ""}`}
        </button>
        <button
          type="button"
          onClick={onClearResults}
          disabled={!hasProspects}
          title="Vaciar la lista de resultados en pantalla sin borrar el historial guardado"
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-600/60 bg-slate-700/20 px-3 py-1.5 text-xs font-semibold text-slate-300 transition hover:bg-slate-700/50 hover:text-slate-100 disabled:opacity-50"
        >
          <IconTrash />
          Limpiar Resultados
        </button>
      </div>
    </div>
  );
}

function NoticeBar({ notice }: { notice: string }) {
  return (
    <div className="border-b border-slate-800 bg-slate-900/50 px-4 py-2 text-xs text-slate-400">
      {notice}
    </div>
  );
}

function ProspectsTable({
  prospects,
  selectedSet,
  allSelected,
  busy,
  onSelectAll,
  onToggle,
  onEnrich,
  onValidate,
}: {
  prospects: Prospect[];
  selectedSet: Set<string>;
  allSelected: boolean;
  busy: Record<string, boolean>;
  onSelectAll: () => void;
  onToggle: (id: string) => void;
  onEnrich: (prospect: Prospect) => void;
  onValidate: (prospect: Prospect) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[1560px] border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-slate-800 text-xs uppercase tracking-wide text-slate-500">
            <th className="w-10 px-4 py-3">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={onSelectAll}
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
          {prospects.map((p) => (
            <ProspectRow
              key={p.id}
              prospect={p}
              selected={selectedSet.has(p.id)}
              busy={Boolean(busy[p.id])}
              onToggle={onToggle}
              onEnrich={onEnrich}
              onValidate={onValidate}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ProspectRow({
  prospect,
  selected,
  busy,
  onToggle,
  onEnrich,
  onValidate,
}: {
  prospect: Prospect;
  selected: boolean;
  busy: boolean;
  onToggle: (id: string) => void;
  onEnrich: (prospect: Prospect) => void;
  onValidate: (prospect: Prospect) => void;
}) {
  const status = prospect.emailStatus ?? "unknown";
  return (
    <tr
      onClick={() => onToggle(prospect.id)}
      className={`cursor-pointer border-b border-slate-800/60 transition-colors ${
        selected ? "bg-sky-500/5" : "hover:bg-slate-800/40"
      }`}
    >
      <td className="px-4 py-3">
        <input
          type="checkbox"
          checked={selected}
          readOnly
          className="pointer-events-none h-4 w-4 accent-sky-500"
          aria-label={`Seleccionar ${prospect.empresa}`}
        />
      </td>
      <td className="px-3 py-3 font-medium text-slate-100">{prospect.empresa}</td>
      <td className="px-3 py-3">
        <div className="flex flex-col items-start gap-1.5">
          <span className="text-slate-300">{prospect.correo}</span>
          <span
            title={prospect.emailReason || "Correo no verificado"}
            className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium ${STATUS_STYLES[status]}`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[status]}`} />
            {prospect.emailStatusLabel ?? "Sin verificar"}
          </span>
        </div>
      </td>
      <td className="px-3 py-3 text-slate-300">{prospect.telefono}</td>
      <td className="px-3 py-3">
        <SocialBadges social={prospect.social} />
      </td>
      <td className="px-3 py-3">
        {prospect.whatsapp ? (
          <a
            href={`https://wa.me/${formatPhoneForWa(prospect.whatsapp)}`}
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
          href={mapsUrl(prospect.direccion)}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="inline-flex items-center gap-1.5 rounded-lg bg-slate-700/40 px-2.5 py-1 text-xs font-medium text-slate-300 transition hover:bg-slate-700/70"
        >
          Mapa
        </a>
      </td>
      <td className="px-3 py-3">
        {prospect.website ? (
          <a
            href={prospect.website}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="text-sky-400 hover:underline"
          >
            {prospect.website.replace(/^https?:\/\//, "").slice(0, 34)}
          </a>
        ) : (
          <span className="text-xs text-slate-600">No disponible</span>
        )}
      </td>
      <td className="px-3 py-3">
        <TechBadges tech={prospect.techStack} ssl={prospect.techSsl} />
      </td>
      <td className="px-3 py-3">
        <OpportunityBadge opportunity={prospect.webOpportunity} />
      </td>
      <td className="px-3 py-3">
        <div className="flex flex-col items-start gap-1.5">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onValidate(prospect);
            }}
            disabled={!(prospect.correo ?? "").trim() || busy}
            title={
              (prospect.correo ?? "").trim()
                ? "Validar sintaxis, MX/DNS y catch-all de este correo"
                : "Sin correo para validar"
            }
            className="inline-flex items-center gap-1.5 rounded-lg border border-teal-700/60 px-2.5 py-1 text-xs font-medium text-teal-300 transition hover:bg-teal-500/15 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy ? "Validando…" : "Validar"}
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onEnrich(prospect);
            }}
            disabled={!prospect.website || busy}
            title={prospect.website ? "Re-escanear el sitio web" : "Sin sitio web para analizar"}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 px-2.5 py-1 text-xs font-medium text-slate-300 transition hover:bg-slate-800 hover:text-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy ? "Analizando…" : "Enriquecer Contactos"}
          </button>
        </div>
      </td>
    </tr>
  );
}
