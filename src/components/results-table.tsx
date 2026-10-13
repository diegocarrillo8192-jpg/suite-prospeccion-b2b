"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import {
  ArrowRight,
  Check,
  ChevronDown,
  Copy,
  Download,
  FileSpreadsheet,
  FileText,
  Globe,
  Lock,
  LockOpen,
  MapPin,
  MessageCircle,
  Search,
  ShieldCheck,
  Sparkles,
  Star,
  Trash2,
  Wand2,
  X,
} from "lucide-react";
import { hasValidEmail, useAppState } from "./app-state";
import { formatPhoneForWa, mapsUrl } from "@/lib/format";
import { mapLimit } from "@/lib/concurrency";
import { downloadCsv } from "@/lib/csv";
import {
  getProvidersSnapshot,
  getServerProvidersSnapshot,
  subscribeProviders,
  type ProviderConfig,
} from "@/lib/providers";
import { exportProspectsToExcel } from "@/lib/export-excel";
import { downloadProspectReport } from "@/lib/export-pdf";
import { SocialBadges } from "./social-icons";
import { Spinner } from "./ui";
import type { EmailValidationStatus, Prospect } from "@/lib/types";
import type { DetectedTech, OpportunityLevel, TechCategory, WebOpportunity } from "@/lib/tech-detector";

const STATUS_STYLES: Record<EmailValidationStatus, string> = {
  valid: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
  risky: "border-amber-500/30 bg-amber-500/10 text-amber-300",
  invalid: "border-rose-500/30 bg-rose-500/10 text-rose-300",
  unknown: "border-white/10 bg-white/[0.04] text-slate-400",
};

const STATUS_DOT: Record<EmailValidationStatus, string> = {
  valid: "bg-emerald-400",
  risky: "bg-amber-400",
  invalid: "bg-rose-400",
  unknown: "bg-slate-500",
};

const CATEGORY_STYLES: Record<TechCategory, string> = {
  cms: "border-violet-500/30 bg-violet-500/10 text-violet-300",
  analytics: "border-sky-500/30 bg-sky-500/10 text-sky-300",
  ecommerce: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
  infrastructure: "border-white/10 bg-white/[0.04] text-slate-300",
};

const CATEGORY_LABELS: Record<TechCategory, string> = {
  cms: "CMS / Framework",
  analytics: "Analítica / Marketing",
  ecommerce: "E-commerce / Pagos",
  infrastructure: "Infraestructura / Seguridad",
};

const OPPORTUNITY_STYLES: Record<OpportunityLevel, string> = {
  alta: "border-amber-500/40 bg-amber-500/10 text-amber-300",
  media: "border-sky-500/30 bg-sky-500/10 text-sky-300",
  baja: "border-white/10 bg-white/[0.04] text-slate-400",
};

type FilterId = "all" | "email" | "website" | "whatsapp" | "hot" | "fresh";
type SortId = "relevance" | "name" | "rating" | "reviews" | "opportunity";

const FILTERS: { id: FilterId; label: string }[] = [
  { id: "all", label: "Todos" },
  { id: "email", label: "Con correo" },
  { id: "website", label: "Con web" },
  { id: "whatsapp", label: "Con teléfono" },
  { id: "hot", label: "Oportunidad alta" },
  { id: "fresh", label: "Sin contactar" },
];

const SORTS: { id: SortId; label: string }[] = [
  { id: "relevance", label: "Relevancia" },
  { id: "name", label: "Nombre (A-Z)" },
  { id: "rating", label: "Mejor calificación" },
  { id: "reviews", label: "Más reseñas" },
  { id: "opportunity", label: "Mayor oportunidad" },
];

function isNA(value: string | undefined): boolean {
  const v = (value ?? "").trim();
  return !v || /^no disponible$/i.test(v);
}

function scoreOf(p: Prospect): number {
  let s = 0;
  if (hasValidEmail(p)) s += 40;
  if (p.emailStatus === "valid") s += 15;
  if (p.whatsapp) s += 15;
  if (p.website) s += 10;
  if (p.social && Object.keys(p.social).length) s += 5;
  if (typeof p.reviews === "number") s += Math.min(15, Math.log10(p.reviews + 1) * 6);
  return s;
}

interface EmailExtractResult {
  id: string;
  emails: string[];
  bestEmail: string;
  emailGuess?: string;
  social?: Prospect["social"];
  emailStatus: EmailValidationStatus;
  emailStatusLabel: string;
  emailReason: string;
  techStack?: DetectedTech[];
  techSsl?: boolean;
  techServer?: string | null;
  webOpportunity?: WebOpportunity | null;
}

interface EmailExtractResponse {
  ok: boolean;
  results: EmailExtractResult[];
  message?: string;
}

interface ValidateResult {
  id: string;
  emailStatus: EmailValidationStatus;
  emailStatusLabel: string;
  emailReason: string;
}

interface ValidateResponse {
  ok: boolean;
  results: ValidateResult[];
  summary?: { valid: number; risky: number; invalid: number; unknown: number };
  message?: string;
}

async function requestEmailExtraction(items: Prospect[], config: ProviderConfig): Promise<EmailExtractResponse> {
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
    const data = await res.json().catch(() => null);
    if (!res.ok || data?.success !== true) {
      return { ok: false, results: [], message: data?.message ?? "No se pudieron extraer correos." };
    }
    return {
      ok: true,
      results: Array.isArray(data.results) ? data.results : [],
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
      body: JSON.stringify({ items: items.map((p) => ({ id: p.id, correo: p.correo })) }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || data?.success !== true) {
      return { ok: false, results: [], message: data?.message ?? "No se pudieron validar los correos." };
    }
    return { ok: true, results: Array.isArray(data.results) ? data.results : [], summary: data?.summary };
  } catch {
    return { ok: false, results: [], message: "Error de conexión al validar los correos." };
  }
}

export function ResultsTable() {
  const {
    prospects,
    selectedIds,
    toggleSelect,
    setSelection,
    clearSelection,
    updateProspects,
    removeProspects,
    setProspects,
    setSearchMeta,
    transferSelected,
    contactedEmails,
    notify,
  } = useAppState();
  const providerConfig = useSyncExternalStore(subscribeProviders, getProvidersSnapshot, getServerProvidersSnapshot);
  const [busy, setBusy] = useState<Record<string, "enrich" | "validate">>({});
  const [bulk, setBulk] = useState<null | "enrich" | "validate" | "excel" | "pdf">(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FilterId>("all");
  const [sort, setSort] = useState<SortId>("relevance");

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const isContacted = useCallback(
    (p: Prospect) => contactedEmails.has((p.correo ?? "").trim().toLowerCase()),
    [contactedEmails]
  );

  const counts = useMemo(
    () => ({
      all: prospects.length,
      email: prospects.filter(hasValidEmail).length,
      website: prospects.filter((p) => p.website).length,
      whatsapp: prospects.filter((p) => p.whatsapp).length,
      hot: prospects.filter((p) => p.webOpportunity?.level === "alta").length,
      fresh: prospects.filter((p) => !isContacted(p)).length,
    }),
    [prospects, isContacted]
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = prospects.filter((p) => {
      if (filter === "email" && !hasValidEmail(p)) return false;
      if (filter === "website" && !p.website) return false;
      if (filter === "whatsapp" && !p.whatsapp) return false;
      if (filter === "hot" && p.webOpportunity?.level !== "alta") return false;
      if (filter === "fresh" && isContacted(p)) return false;
      if (!q) return true;
      return [p.empresa, p.correo, p.rubro, p.direccion, p.website, p.telefono]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
    if (sort !== "relevance") {
      list = [...list].sort((a, b) => {
        switch (sort) {
          case "name":
            return a.empresa.localeCompare(b.empresa, "es");
          case "rating":
            return (b.rating ?? 0) - (a.rating ?? 0);
          case "reviews":
            return (b.reviews ?? 0) - (a.reviews ?? 0);
          case "opportunity":
            return (b.webOpportunity?.score ?? -1) - (a.webOpportunity?.score ?? -1);
          default:
            return 0;
        }
      });
    } else {
      list = [...list].sort((a, b) => scoreOf(b) - scoreOf(a));
    }
    return list;
  }, [prospects, query, filter, sort, isContacted]);

  const selectedProspects = useMemo(
    () => prospects.filter((p) => selectedSet.has(p.id)),
    [prospects, selectedSet]
  );
  const targets = selectedProspects.length > 0 ? selectedProspects : visible;
  const allVisibleSelected = visible.length > 0 && visible.every((p) => selectedSet.has(p.id));

  function toggleAllVisible() {
    if (allVisibleSelected) {
      const drop = new Set(visible.map((p) => p.id));
      setSelection(selectedIds.filter((id) => !drop.has(id)));
    } else {
      setSelection(Array.from(new Set([...selectedIds, ...visible.map((p) => p.id)])));
    }
  }

  function markBusy(ids: string[], kind: "enrich" | "validate" | null) {
    setBusy((prev) => {
      const next = { ...prev };
      for (const id of ids) {
        if (kind) next[id] = kind;
        else delete next[id];
      }
      return next;
    });
  }

  const runEmailExtraction = useCallback(
    async (list: Prospect[]) => {
      const withSite = list.filter((p) => p.website);
      if (withSite.length === 0) {
        notify("info", "Nada que enriquecer", "Ninguno de los prospectos tiene sitio web propio.");
        return;
      }
      const ids = withSite.map((p) => p.id);
      markBusy(ids, "enrich");
      setProgress({ done: 0, total: withSite.length });

      const chunks: Prospect[][] = [];
      for (let i = 0; i < withSite.length; i += 5) chunks.push(withSite.slice(i, i + 5));

      let found = 0;
      let failure: string | null = null;
      await mapLimit(chunks, 3, async (chunk) => {
        const response = await requestEmailExtraction(chunk, providerConfig);
        const updates: Record<string, Partial<Prospect>> = {};
        if (!response.ok) failure = response.message ?? "No se pudieron extraer correos.";
        else if (response.message) failure = response.message;
        for (const result of response.results) {
          const patch: Partial<Prospect> = {
            emailStatus: result.emailStatus,
            emailStatusLabel: result.emailStatusLabel,
            emailReason: result.emailReason,
            enriched: true,
          };
          if (result.emails.length > 0) patch.emails = result.emails;
          if (result.social && Object.keys(result.social).length > 0) patch.social = result.social;
          if (result.bestEmail) {
            patch.correo = result.bestEmail;
            patch.emailGuess = undefined;
            found++;
          } else if (result.emailGuess) {
            patch.emailGuess = result.emailGuess;
          }
          if (result.techStack) patch.techStack = result.techStack;
          if (typeof result.techSsl === "boolean") patch.techSsl = result.techSsl;
          if (result.techServer !== undefined) patch.techServer = result.techServer;
          if (result.webOpportunity) patch.webOpportunity = result.webOpportunity;
          updates[result.id] = patch;
        }
        if (Object.keys(updates).length) updateProspects(updates);
        markBusy(
          chunk.map((p) => p.id),
          null
        );
        setProgress((p) => (p ? { ...p, done: p.done + chunk.length } : p));
        return null;
      });

      markBusy(ids, null);
      setProgress(null);
      if (found > 0) {
        notify("success", "Enriquecimiento completado", `${found} de ${withSite.length} sitios con correo encontrado.`);
      } else if (failure) {
        notify("error", "No se pudo enriquecer", failure);
      } else {
        notify("info", "Sin correos nuevos", "Se analizaron los sitios pero no publican un correo visible.");
      }
    },
    [providerConfig, updateProspects, notify]
  );

  const runValidation = useCallback(
    async (list: Prospect[]) => {
      const withEmail = list.filter(hasValidEmail);
      if (withEmail.length === 0) {
        notify("info", "Nada que validar", "Ninguno de los prospectos tiene correo.");
        return;
      }
      const ids = withEmail.map((p) => p.id);
      markBusy(ids, "validate");
      try {
        const response = await requestValidation(withEmail);
        if (!response.ok) {
          notify("error", "Validación fallida", response.message);
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
        const s = response.summary;
        notify(
          "success",
          "Validación completada",
          s
            ? `${s.valid} válidos · ${s.risky} riesgosos · ${s.invalid} inválidos`
            : `${Object.keys(updates).length} correos validados.`
        );
      } finally {
        markBusy(ids, null);
      }
    },
    [updateProspects, notify]
  );

  async function bulkRun(kind: "enrich" | "validate") {
    setBulk(kind);
    try {
      if (kind === "enrich") await runEmailExtraction(targets);
      else await runValidation(targets);
    } finally {
      setBulk(null);
    }
  }

  async function exportAs(kind: "csv" | "excel" | "pdf") {
    if (targets.length === 0) return;
    if (kind === "csv") {
      downloadCsv(targets);
      notify("success", "CSV exportado", `${targets.length} prospectos.`);
      return;
    }
    setBulk(kind);
    try {
      if (kind === "excel") await exportProspectsToExcel(targets);
      else await downloadProspectReport(targets);
      notify("success", kind === "excel" ? "Excel exportado" : "Reporte PDF descargado", `${targets.length} prospectos.`);
    } catch {
      notify("error", "No se pudo generar el archivo");
    } finally {
      setBulk(null);
    }
  }

  function applyGuess(p: Prospect) {
    if (!p.emailGuess) return;
    updateProspects({
      [p.id]: {
        correo: p.emailGuess,
        emailGuess: undefined,
        emailStatus: "risky",
        emailStatusLabel: "Sugerido",
        emailReason: "Correo genérico deducido del dominio (MX activo). No confirmado en el sitio.",
      },
    });
    notify("success", "Correo sugerido asignado", p.emailGuess);
  }

  function deleteSelected() {
    if (selectedIds.length === 0) return;
    removeProspects(selectedIds);
    notify("info", `${selectedIds.length} prospectos eliminados de la lista`);
  }

  function clearAll() {
    if (!window.confirm("¿Vaciar la lista de resultados? El historial de duplicados se conserva.")) return;
    setProspects([]);
    setSearchMeta(null);
    clearSelection();
  }

  function transfer() {
    const { added, skipped } = transferSelected();
    if (added === 0 && skipped > 0) {
      notify("error", "Sin correos para enviar", "Los prospectos seleccionados no tienen correo. Enriquécelos primero.");
    } else {
      notify(
        "success",
        `${added} destinatarios añadidos a la campaña`,
        skipped ? `${skipped} omitidos por no tener correo.` : undefined
      );
    }
  }

  const scope = selectedProspects.length > 0 ? `${selectedProspects.length} seleccionados` : `${visible.length} visibles`;

  return (
    <div className="card overflow-hidden">
      {/* Filtros y búsqueda */}
      <div className="flex flex-col gap-3 border-b border-white/[0.06] px-4 py-4 sm:px-5 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              aria-pressed={filter === f.id}
              className={`chip transition ${
                filter === f.id ? "border-violet-400/50 bg-violet-500/15 text-white" : "hover:border-white/20 hover:text-white"
              }`}
            >
              {f.label}
              <span className="text-slate-500 tabular-nums">{counts[f.id]}</span>
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <div className="relative flex-1 xl:w-64 xl:flex-none">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filtrar por nombre, correo, zona…"
              aria-label="Filtrar resultados"
              className="input py-2 pl-9 text-xs"
            />
          </div>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortId)}
            aria-label="Ordenar resultados"
            className="input w-auto py-2 text-xs"
          >
            {SORTS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Acciones */}
      <div
        className={`flex flex-col gap-3 border-b border-white/[0.06] px-4 py-3 transition sm:px-5 lg:flex-row lg:items-center lg:justify-between ${
          selectedProspects.length ? "bg-violet-500/[0.07]" : "bg-white/[0.01]"
        }`}
      >
        <div className="flex items-center gap-2 text-xs text-slate-400">
          {selectedProspects.length > 0 ? (
            <>
              <span className="font-semibold text-white">{selectedProspects.length} seleccionados</span>
              <button type="button" onClick={clearSelection} className="btn btn-sm btn-ghost">
                <X className="h-3.5 w-3.5" /> Quitar selección
              </button>
            </>
          ) : (
            <span>Las acciones se aplican a los {visible.length} prospectos visibles.</span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => bulkRun("enrich")}
            disabled={bulk !== null || targets.length === 0}
            title="Extrae correos, redes, SSL y tecnologías del sitio web"
            className="btn btn-sm border border-amber-500/30 bg-amber-500/10 text-amber-200 hover:bg-amber-500/20"
          >
            {bulk === "enrich" ? <Spinner className="h-3.5 w-3.5" /> : <Wand2 className="h-3.5 w-3.5" />}
            {bulk === "enrich" && progress ? `Enriqueciendo ${progress.done}/${progress.total}` : "Enriquecer"}
          </button>
          <button
            type="button"
            onClick={() => bulkRun("validate")}
            disabled={bulk !== null || targets.length === 0}
            title="Valida sintaxis, registros MX y dominios catch-all / desechables"
            className="btn btn-sm border border-teal-500/30 bg-teal-500/10 text-teal-200 hover:bg-teal-500/20"
          >
            {bulk === "validate" ? <Spinner className="h-3.5 w-3.5" /> : <ShieldCheck className="h-3.5 w-3.5" />}
            Validar correos
          </button>
          <ExportMenu disabled={bulk !== null || targets.length === 0} busy={bulk} scope={scope} onExport={exportAs} />
          {selectedProspects.length > 0 ? (
            <button type="button" onClick={deleteSelected} className="btn btn-sm btn-danger">
              <Trash2 className="h-3.5 w-3.5" /> Eliminar
            </button>
          ) : (
            <button type="button" onClick={clearAll} className="btn btn-sm btn-ghost">
              <Trash2 className="h-3.5 w-3.5" /> Vaciar lista
            </button>
          )}
        </div>
      </div>

      {progress && (
        <div className="h-0.5 bg-white/[0.04]">
          <div
            className="h-full bg-gradient-to-r from-amber-400 to-violet-400 transition-[width] duration-300"
            style={{ width: `${Math.round((progress.done / Math.max(progress.total, 1)) * 100)}%` }}
          />
        </div>
      )}

      {visible.length === 0 ? (
        <p className="px-6 py-12 text-center text-sm text-slate-500">Ningún prospecto coincide con el filtro.</p>
      ) : (
        <>
          {/* Escritorio */}
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[1080px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-white/[0.06] text-[11px] tracking-wide text-slate-500 uppercase">
                  <th className="w-10 py-3 pr-2 pl-5">
                    <input
                      type="checkbox"
                      checked={allVisibleSelected}
                      onChange={toggleAllVisible}
                      className="checkbox"
                      aria-label="Seleccionar todo"
                    />
                  </th>
                  <th className="px-3 py-3 font-medium">Empresa</th>
                  <th className="px-3 py-3 font-medium">Contacto</th>
                  <th className="px-3 py-3 font-medium">Redes</th>
                  <th className="px-3 py-3 font-medium">Sitio web</th>
                  <th className="px-3 py-3 font-medium">Oportunidad</th>
                  <th className="px-3 py-3 pr-5 text-right font-medium">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((p) => (
                  <ProspectRow
                    key={p.id}
                    prospect={p}
                    selected={selectedSet.has(p.id)}
                    busy={busy[p.id]}
                    contacted={isContacted(p)}
                    onToggle={toggleSelect}
                    onEnrich={(x) => void runEmailExtraction([x])}
                    onValidate={(x) => void runValidation([x])}
                    onUseGuess={applyGuess}
                    onRemove={(x) => removeProspects([x.id])}
                    onCopy={(text) => {
                      void navigator.clipboard?.writeText(text);
                      notify("success", "Copiado al portapapeles", text);
                    }}
                  />
                ))}
              </tbody>
            </table>
          </div>

          {/* Móvil */}
          <ul className="divide-y divide-white/[0.05] md:hidden">
            {visible.map((p) => (
              <ProspectCard
                key={p.id}
                prospect={p}
                selected={selectedSet.has(p.id)}
                busy={busy[p.id]}
                contacted={isContacted(p)}
                onToggle={toggleSelect}
                onEnrich={(x) => void runEmailExtraction([x])}
                onValidate={(x) => void runValidation([x])}
                onUseGuess={applyGuess}
              />
            ))}
          </ul>
        </>
      )}

      <div className="flex flex-col gap-3 border-t border-white/[0.06] bg-white/[0.01] px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <p className="text-xs text-slate-400">
          <span className="font-semibold text-slate-200">{selectedProspects.length}</span> de {prospects.length}{" "}
          seleccionados · {counts.email} con correo
        </p>
        <div className="flex flex-wrap gap-2">
          {selectedProspects.length === 0 && counts.email > 0 && (
            <button
              type="button"
              onClick={() => setSelection(visible.filter(hasValidEmail).map((p) => p.id))}
              className="btn btn-sm btn-secondary"
            >
              <Check className="h-3.5 w-3.5" /> Seleccionar los que tienen correo
            </button>
          )}
          <button type="button" onClick={transfer} disabled={selectedProspects.length === 0} className="btn btn-sm btn-primary">
            Transferir Lista a Emisor de Correos <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

function ExportMenu({
  disabled,
  busy,
  scope,
  onExport,
}: {
  disabled: boolean;
  busy: string | null;
  scope: string;
  onExport: (kind: "csv" | "excel" | "pdf") => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const items = [
    { id: "excel" as const, label: "Excel (.xlsx)", icon: FileSpreadsheet, tone: "text-emerald-300" },
    { id: "pdf" as const, label: "Reporte PDF", icon: FileText, tone: "text-rose-300" },
    { id: "csv" as const, label: "CSV", icon: Download, tone: "text-sky-300" },
  ];

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={open}
        className="btn btn-sm btn-secondary"
      >
        {busy === "excel" || busy === "pdf" ? <Spinner className="h-3.5 w-3.5" /> : <Download className="h-3.5 w-3.5" />}
        Exportar <ChevronDown className="h-3 w-3" />
      </button>
      {open && (
        <div
          role="menu"
          className="animate-pop-in absolute right-0 z-30 mt-2 w-56 overflow-hidden rounded-xl border border-white/10 bg-[#0d1220]/95 p-1 shadow-2xl shadow-black/60 backdrop-blur-xl"
        >
          <p className="px-3 py-2 text-[10px] font-semibold tracking-wider text-slate-500 uppercase">{scope}</p>
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onExport(item.id);
              }}
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-xs font-medium text-slate-200 transition hover:bg-white/[0.06]"
            >
              <item.icon className={`h-4 w-4 ${item.tone}`} />
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function TechBadges({ tech, ssl }: { tech?: DetectedTech[]; ssl?: boolean }) {
  const items = tech ?? [];
  if (items.length === 0 && ssl === undefined) return null;
  return (
    <div className="mt-1.5 flex max-w-[260px] flex-wrap items-center gap-1">
      {ssl === false ? (
        <span className="badge border-rose-500/30 bg-rose-500/10 text-[10px] text-rose-300">
          <LockOpen className="h-2.5 w-2.5" /> Sin SSL
        </span>
      ) : ssl === true ? (
        <span className="badge border-emerald-500/25 bg-emerald-500/5 text-[10px] text-emerald-300">
          <Lock className="h-2.5 w-2.5" /> SSL
        </span>
      ) : null}
      {items.slice(0, 4).map((item) => (
        <span key={item.id} title={CATEGORY_LABELS[item.category]} className={`badge text-[10px] ${CATEGORY_STYLES[item.category]}`}>
          {item.name}
        </span>
      ))}
      {items.length > 4 && (
        <span className="badge border-white/10 text-[10px] text-slate-400" title={items.slice(4).map((i) => i.name).join(", ")}>
          +{items.length - 4}
        </span>
      )}
    </div>
  );
}

function OpportunityBadge({ opportunity }: { opportunity?: WebOpportunity }) {
  if (!opportunity) return <span className="text-xs text-slate-600">—</span>;
  return (
    <div
      title={opportunity.reasons.length ? opportunity.reasons.join("\n") : "Sin observaciones"}
      className={`inline-flex min-w-[96px] flex-col gap-1 rounded-xl border px-2.5 py-1.5 ${OPPORTUNITY_STYLES[opportunity.level]}`}
    >
      <span className="flex items-center gap-1 text-[11px] font-semibold">
        {opportunity.level === "alta" && <Sparkles className="h-3 w-3" />}
        {opportunity.label}
      </span>
      <span className="h-1 overflow-hidden rounded-full bg-white/10">
        <span className="block h-full rounded-full bg-current opacity-70" style={{ width: `${opportunity.score}%` }} />
      </span>
    </div>
  );
}

function RatingBadge({ rating, reviews }: { rating?: number; reviews?: number }) {
  if (typeof rating !== "number" || !Number.isFinite(rating)) return null;
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-300">
      <Star className="h-3 w-3 fill-current" />
      {rating.toFixed(1)}
      {typeof reviews === "number" && <span className="text-slate-500">({reviews})</span>}
    </span>
  );
}

function EmailCell({ prospect, onUseGuess }: { prospect: Prospect; onUseGuess?: (p: Prospect) => void }) {
  const status = prospect.emailStatus ?? "unknown";
  const has = hasValidEmail(prospect);
  if (!has) {
    if (prospect.emailGuess) {
      return (
        <div className="flex flex-col items-start gap-1">
          <span className="max-w-[230px] truncate text-[13px] text-slate-400 italic" title="Correo probable: el dominio recibe correo (MX activo)">
            {prospect.emailGuess}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="badge border-sky-500/30 bg-sky-500/10 text-[10px] text-sky-300">Sugerido · MX activo</span>
            {onUseGuess && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onUseGuess(prospect);
                }}
                className="text-[10px] font-semibold text-violet-300 underline hover:text-violet-200"
              >
                Usar
              </button>
            )}
          </span>
        </div>
      );
    }
    return <span className="text-xs text-slate-600">Sin correo</span>;
  }
  return (
    <div className="flex min-w-0 flex-col items-start gap-1">
      <span className="max-w-[230px] truncate text-[13px] text-slate-200" title={prospect.correo}>
        {prospect.correo}
      </span>
      <span className="flex items-center gap-1.5">
        <span
          title={prospect.emailReason || "Correo no verificado"}
          className={`badge text-[10px] ${STATUS_STYLES[status]}`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[status]}`} />
          {prospect.emailStatusLabel ?? "Sin verificar"}
        </span>
        {prospect.emails && prospect.emails.length > 1 && (
          <span className="text-[10px] text-slate-500" title={prospect.emails.join("\n")}>
            +{prospect.emails.length - 1} más
          </span>
        )}
      </span>
    </div>
  );
}

interface RowProps {
  prospect: Prospect;
  selected: boolean;
  busy?: "enrich" | "validate";
  contacted: boolean;
  onToggle: (id: string) => void;
  onEnrich: (p: Prospect) => void;
  onValidate: (p: Prospect) => void;
  onUseGuess: (p: Prospect) => void;
}

function ProspectRow({
  prospect: p,
  selected,
  busy,
  contacted,
  onToggle,
  onEnrich,
  onValidate,
  onUseGuess,
  onRemove,
  onCopy,
}: RowProps & { onRemove: (p: Prospect) => void; onCopy: (text: string) => void }) {
  const stop = (fn: () => void) => (e: React.MouseEvent) => {
    e.stopPropagation();
    fn();
  };
  return (
    <tr
      onClick={() => onToggle(p.id)}
      className={`group cursor-pointer border-b border-white/[0.04] align-top transition-colors ${
        selected ? "bg-violet-500/[0.07]" : "hover:bg-white/[0.025]"
      }`}
    >
      <td className="py-3.5 pr-2 pl-5">
        <input
          type="checkbox"
          checked={selected}
          readOnly
          className="checkbox pointer-events-none"
          aria-label={`Seleccionar ${p.empresa}`}
        />
      </td>
      <td className="max-w-[280px] px-3 py-3.5">
        <p className="font-medium text-slate-100">{p.empresa}</p>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
          <RatingBadge rating={p.rating} reviews={p.reviews} />
          {!isNA(p.rubro) && <span className="text-[11px] text-slate-500">{p.rubro}</span>}
          {contacted && <span className="badge border-emerald-500/30 bg-emerald-500/10 text-[10px] text-emerald-300">Contactado</span>}
        </div>
        {!isNA(p.direccion) && (
          <a
            href={mapsUrl(`${p.empresa}, ${p.direccion}`)}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="mt-1 flex items-start gap-1 text-[11px] text-slate-500 hover:text-sky-300"
          >
            <MapPin className="mt-px h-3 w-3 shrink-0" />
            <span className="line-clamp-1">{p.direccion}</span>
          </a>
        )}
      </td>
      <td className="px-3 py-3.5">
        <EmailCell prospect={p} onUseGuess={onUseGuess} />
        {!isNA(p.telefono) && (
          <div className="mt-1.5 flex items-center gap-2">
            <span className="text-xs text-slate-400 tabular-nums">{p.telefono}</span>
            {p.whatsapp && (
              <a
                href={`https://wa.me/${formatPhoneForWa(p.whatsapp)}`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                title="Abrir WhatsApp"
                className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-300 transition hover:bg-emerald-500/20"
              >
                <MessageCircle className="h-3 w-3" /> WhatsApp
              </a>
            )}
          </div>
        )}
      </td>
      <td className="px-3 py-3.5">
        <SocialBadges social={p.social} />
      </td>
      <td className="px-3 py-3.5">
        {p.website ? (
          <a
            href={p.website}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="inline-flex max-w-[220px] items-center gap-1 truncate text-[13px] text-sky-300 hover:underline"
          >
            <Globe className="h-3 w-3 shrink-0" />
            {p.website.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "").slice(0, 32)}
          </a>
        ) : (
          <span className="text-xs text-slate-600">Sin web propia</span>
        )}
        <TechBadges tech={p.techStack} ssl={p.techSsl} />
      </td>
      <td className="px-3 py-3.5">
        <OpportunityBadge opportunity={p.webOpportunity} />
      </td>
      <td className="px-3 py-3.5 pr-5">
        <div className="flex items-center justify-end gap-1 opacity-80 transition group-hover:opacity-100">
          <IconButton
            label={hasValidEmail(p) ? "Validar correo (MX)" : "Sin correo para validar"}
            disabled={!hasValidEmail(p) || Boolean(busy)}
            onClick={stop(() => onValidate(p))}
          >
            {busy === "validate" ? <Spinner className="h-3.5 w-3.5" /> : <ShieldCheck className="h-3.5 w-3.5" />}
          </IconButton>
          <IconButton
            label={p.website ? "Enriquecer desde el sitio web" : "Sin sitio web para analizar"}
            disabled={!p.website || Boolean(busy)}
            onClick={stop(() => onEnrich(p))}
          >
            {busy === "enrich" ? <Spinner className="h-3.5 w-3.5" /> : <Wand2 className="h-3.5 w-3.5" />}
          </IconButton>
          <IconButton label="Copiar correo" disabled={!hasValidEmail(p)} onClick={stop(() => onCopy(p.correo))}>
            <Copy className="h-3.5 w-3.5" />
          </IconButton>
          <IconButton label="Quitar de la lista" onClick={stop(() => onRemove(p))} danger>
            <Trash2 className="h-3.5 w-3.5" />
          </IconButton>
        </div>
      </td>
    </tr>
  );
}

function ProspectCard({ prospect: p, selected, busy, contacted, onToggle, onEnrich, onValidate, onUseGuess }: RowProps) {
  return (
    <li className={`px-4 py-4 transition ${selected ? "bg-violet-500/[0.07]" : ""}`}>
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={selected}
          onChange={() => onToggle(p.id)}
          className="checkbox mt-1"
          aria-label={`Seleccionar ${p.empresa}`}
        />
        <div className="min-w-0 flex-1">
          <p className="font-medium text-slate-100">{p.empresa}</p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <RatingBadge rating={p.rating} reviews={p.reviews} />
            {contacted && <span className="badge border-emerald-500/30 text-[10px] text-emerald-300">Contactado</span>}
            {p.webOpportunity && <OpportunityBadge opportunity={p.webOpportunity} />}
          </div>
          <div className="mt-2.5">
            <EmailCell prospect={p} onUseGuess={onUseGuess} />
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
            {!isNA(p.telefono) && <span className="text-slate-400">{p.telefono}</span>}
            {p.whatsapp && (
              <a
                href={`https://wa.me/${formatPhoneForWa(p.whatsapp)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-300"
              >
                <MessageCircle className="h-3 w-3" /> WhatsApp
              </a>
            )}
            {p.website && (
              <a href={p.website} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sky-300">
                <Globe className="h-3 w-3" /> Web
              </a>
            )}
          </div>
          <div className="mt-2">
            <SocialBadges social={p.social} />
          </div>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => onValidate(p)}
              disabled={!hasValidEmail(p) || Boolean(busy)}
              className="btn btn-sm btn-secondary"
            >
              <ShieldCheck className="h-3.5 w-3.5" /> Validar
            </button>
            <button
              type="button"
              onClick={() => onEnrich(p)}
              disabled={!p.website || Boolean(busy)}
              className="btn btn-sm btn-secondary"
            >
              {busy ? <Spinner className="h-3.5 w-3.5" /> : <Wand2 className="h-3.5 w-3.5" />} Enriquecer
            </button>
          </div>
        </div>
      </div>
    </li>
  );
}

function IconButton({
  label,
  disabled,
  onClick,
  danger,
  children,
}: {
  label: string;
  disabled?: boolean;
  onClick: (e: React.MouseEvent) => void;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={`flex h-8 w-8 items-center justify-center rounded-lg border border-white/[0.07] bg-white/[0.02] transition disabled:cursor-not-allowed disabled:opacity-30 ${
        danger
          ? "text-slate-500 hover:border-rose-500/40 hover:bg-rose-500/10 hover:text-rose-300"
          : "text-slate-400 hover:border-white/20 hover:bg-white/[0.07] hover:text-white"
      }`}
    >
      {children}
    </button>
  );
}
