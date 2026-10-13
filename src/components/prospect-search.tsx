"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type FormEvent } from "react";
import {
  AlertTriangle,
  Building2,
  DatabaseZap,
  Send,
  LayoutGrid,
  Cloud,
  Cpu,
  History,
  KeyRound,
  MapPin,
  RotateCcw,
  Search,
  SearchX,
  Sparkles,
  X,
} from "lucide-react";
import { isSendable, useAppState } from "./app-state";
import { ContactImportModal } from "./contact-import";
import { sanitizeText } from "@/lib/sanitize";
import { ResultsTable } from "./results-table";
import { EmptyState, PageHeader, Spinner, Toggle } from "./ui";
import { Modal } from "./modal";
import { ALL_NICHES, NICHE_CATALOG } from "@/lib/niches";
import {
  filterDuplicates,
  rememberProspects,
  clearHistory,
  subscribeHistory,
  getHistoryCount,
  getServerHistoryCount,
} from "@/lib/duplicates";
import type { ExtractionMeta } from "@/lib/extract";
import type { Prospect } from "@/lib/types";
import {
  getProvidersSnapshot,
  getServerProvidersSnapshot,
  hasAnyApiKey,
  isApiMode,
  preferredApiEngine,
  saveProviderConfig,
  subscribeProviders,
  type EngineId,
} from "@/lib/providers";

const LIMITS = [10, 25, 50, 100];

const NICHE_SUGGESTIONS = [
  "Restaurantes",
  "Clínicas dentales",
  "Abogados",
  "Inmobiliarias",
  "Gimnasios",
  "Talleres mecánicos",
  "Salones de belleza",
  "Hoteles",
  "Contadores",
  "Veterinarias",
  "Constructoras",
  "Agencias de viajes",
];

const CITY_SUGGESTIONS = [
  "Ciudad de Panamá",
  "David, Chiriquí",
  "Colón, Panamá",
  "Bogotá",
  "Ciudad de México",
  "Madrid",
  "Miami",
  "Buenos Aires",
  "Lima",
  "Santiago de Chile",
];

const STAGES = [
  "Ubicando la ciudad en el mapa…",
  "Consultando Google Maps y OpenStreetMap…",
  "Leyendo fichas de negocios…",
  "Visitando sitios web para extraer correos…",
  "Detectando redes sociales y WhatsApp…",
  "Validando dominios de correo (MX)…",
  "Ordenando y limpiando resultados…",
];

type SearchOutcome =
  | { ok: true; prospects: Prospect[]; meta?: ExtractionMeta }
  | { ok: false; message: string };

interface SearchRequest {
  niche: string;
  city: string;
  limit: number;
  engine: EngineId;
  apifyToken: string;
  apifyActor: string;
  googleKey: string;
  deepCrawl: boolean;
}

async function requestProspects(params: SearchRequest, signal: AbortSignal): Promise<SearchOutcome> {
  const res = await fetch("/api/prospect", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
    signal,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || data?.success !== true) {
    return { ok: false, message: data?.message ?? "No se pudieron obtener resultados." };
  }
  return { ok: true, prospects: data.prospects ?? [], meta: data.meta };
}

export function ProspectSearch() {
  const {
    prospects,
    setProspects,
    clearSelection,
    searchDraft,
    setSearchDraft,
    searchMeta,
    setSearchMeta,
    addRecentSearch,
    openDialog,
    notify,
    recipients,
    queueProspects,
    autoQueue,
    setAutoQueue,
    setTab,
  } = useAppState();
  const [importOpen, setImportOpen] = useState(false);
  const recipientEmails = useMemo(
    () => new Set(recipients.map((r) => (r.correo ?? "").trim().toLowerCase())),
    [recipients]
  );
  const sendableProspects = useMemo(() => prospects.filter(isSendable), [prospects]);
  const pendingQueue = sendableProspects.filter((p) => !recipientEmails.has(p.correo.trim().toLowerCase()));
  const readyCount = sendableProspects.length - pendingQueue.length;
  const providerConfig = useSyncExternalStore(subscribeProviders, getProvidersSnapshot, getServerProvidersSnapshot);
  const historyCount = useSyncExternalStore(subscribeHistory, getHistoryCount, getServerHistoryCount);

  const [loading, setLoading] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [emptyInfo, setEmptyInfo] = useState<{ skipped: number } | null>(null);
  const [skipDuplicates, setSkipDuplicates] = useState(true);
  const [deepCrawl, setDeepCrawl] = useState(true);
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [cityStep, setCityStep] = useState<{ index: number; total: number; city: string } | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const { niche, city, limit } = searchDraft;
  const engine = providerConfig.engine;
  const apiMode = isApiMode(engine);
  const apiReady = hasAnyApiKey(providerConfig);
  const apifyReady = providerConfig.apifyToken.trim().length > 0;
  const googleReady = providerConfig.googleKey.trim().length > 0;
  const engineHasKey = engine === "apify" ? apifyReady : engine === "google" ? googleReady : true;

  useEffect(() => {
    if (!loading) return;
    const started = Date.now();
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 500);
    return () => clearInterval(t);
  }, [loading]);

  useEffect(() => () => abortRef.current?.abort(), []);

  function setEngine(next: EngineId) {
    saveProviderConfig({ ...providerConfig, engine: next });
  }

  function cancelSearch() {
    abortRef.current?.abort();
  }

  async function onSubmit(e?: FormEvent<HTMLFormElement>) {
    e?.preventDefault();
    if (loading) return;
    const n = sanitizeText(niche);
    const c = sanitizeText(city);
    if (!c) {
      setError("Indica una ubicación / ciudad para buscar.");
      return;
    }
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setElapsed(0);
    setError(null);
    setEmptyInfo(null);
    clearSelection();

    const cities = c
      .split(/[;\n]+/)
      .map((x) => x.trim())
      .filter(Boolean)
      .slice(0, 5);

    try {
      const merged: Prospect[] = [];
      const seenIds = new Set<string>();
      let firstMeta: ExtractionMeta | undefined;
      const warnings: string[] = [];
      let lastError = "";

      for (let i = 0; i < cities.length; i++) {
        if (controller.signal.aborted) break;
        setCityStep(cities.length > 1 ? { index: i + 1, total: cities.length, city: cities[i] } : null);
        setElapsed(0);
        const result = await requestProspects(
          {
            niche: n,
            city: cities[i],
            limit,
            engine,
            apifyToken: providerConfig.apifyToken,
            apifyActor: providerConfig.apifyActor,
            googleKey: providerConfig.googleKey,
            deepCrawl,
          },
          controller.signal
        );
        if (!result.ok) {
          lastError = result.message;
          continue;
        }
        if (!firstMeta) firstMeta = result.meta;
        if (result.meta?.warning) warnings.push(result.meta.warning);
        for (const p of result.prospects) {
          if (seenIds.has(p.id)) continue;
          seenIds.add(p.id);
          merged.push(p);
        }
      }

      if (merged.length === 0 && lastError) {
        setError(lastError);
        return;
      }
      const { fresh, skipped } = skipDuplicates ? filterDuplicates(merged) : { fresh: merged, skipped: 0 };
      rememberProspects(fresh);
      addRecentSearch({ niche: n, city: cities.join("; "), count: fresh.length, at: Date.now() });
      if (fresh.length === 0) {
        setEmptyInfo({ skipped });
        return;
      }
      setProspects(fresh);
      // Los que ya traen correo quedan listos en el Emisor sin exportar ni importar nada.
      const queued = autoQueue ? queueProspects(fresh) : 0;
      setSearchMeta(
        firstMeta
          ? { ...firstMeta, cityName: cities.length > 1 ? cities.join(" · ") : firstMeta.cityName }
          : null
      );
      const withEmail = fresh.filter((p) => p.correo && p.correo !== "No disponible").length;
      notify(
        "success",
        `${fresh.length} prospectos encontrados`,
        `${withEmail} con correo${autoQueue ? ` · ${queued} listos para enviar en la campaña` : ""}${
          skipped ? ` · ${skipped} duplicados omitidos` : ""
        }${
          cities.length > 1 ? ` · ${cities.length} ciudades` : ""
        }`
      );
      if (warnings.length) notify("info", "Aviso del proveedor", warnings[0]);
    } catch (err) {
      if ((err as Error)?.name === "AbortError") {
        notify("info", "Búsqueda cancelada");
      } else {
        setError("Error de conexión al buscar prospectos. Revisa tu conexión e intenta de nuevo.");
      }
    } finally {
      setLoading(false);
      setCityStep(null);
      abortRef.current = null;
    }
  }

  const stage = STAGES[Math.min(STAGES.length - 1, Math.floor(elapsed / 6))];
  const expected = deepCrawl ? Math.round(18 + limit * 0.45) : Math.round(12 + limit * 0.15);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Buscador"
        title="Encuentra empresas para prospectar"
        description="Extracción real de negocios por nicho y ciudad en cualquier país, con correos, WhatsApp, redes sociales y análisis del sitio web."
        actions={
          <>
            <button type="button" onClick={() => setImportOpen(true)} className="btn btn-secondary">
              <DatabaseZap className="h-4 w-4" /> Importar base de datos
            </button>
            <button type="button" onClick={() => openDialog("providers")} className="btn btn-secondary">
              <KeyRound className="h-4 w-4" /> Proveedores / APIs
            </button>
          </>
        }
      />

      <form onSubmit={onSubmit} className="card card-pad animate-fade-up">
        <div className="grid gap-4 lg:grid-cols-[1fr_1fr_auto]">
          <div>
            <label htmlFor="search-niche" className="label">
              Nicho / Rubro
            </label>
            <div className="relative">
              <Building2 className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <input
                id="search-niche"
                value={niche}
                onChange={(e) => setSearchDraft({ niche: e.target.value })}
                placeholder="Ej: Restaurantes, Clínicas dentales…"
                list="niche-suggestions"
                className="input pl-10"
                maxLength={60}
              />
              <datalist id="niche-suggestions">
                {ALL_NICHES.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
            </div>
          </div>
          <div>
            <label htmlFor="search-city" className="label">
              Ubicación / Ciudad
            </label>
            <div className="relative">
              <MapPin className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <input
                id="search-city"
                value={city}
                onChange={(e) => setSearchDraft({ city: e.target.value })}
                placeholder="Ej: Ciudad de Panamá; Colón; David"
                list="city-suggestions"
                className="input pl-10"
                maxLength={80}
              />
              <p className="mt-1 text-[10px] text-slate-500">Varias ciudades: sepáralas con punto y coma (;) · máx. 5</p>
              <datalist id="city-suggestions">
                {CITY_SUGGESTIONS.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
            </div>
          </div>
          <div>
            <span className="label">Cantidad</span>
            <div role="radiogroup" aria-label="Cantidad de prospectos" className="flex rounded-xl border border-white/10 bg-slate-950/50 p-1">
              {LIMITS.map((l) => (
                <button
                  key={l}
                  type="button"
                  role="radio"
                  aria-checked={limit === l}
                  onClick={() => setSearchDraft({ limit: l })}
                  className={`flex-1 rounded-lg px-3 py-1.5 text-sm font-semibold tabular-nums transition lg:flex-none ${
                    limit === l ? "bg-violet-500/25 text-white ring-1 ring-violet-400/30" : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  {l}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <button type="button" onClick={() => setCatalogOpen(true)} className="chip border-violet-400/40 bg-violet-500/10 text-violet-200 hover:bg-violet-500/20">
            <LayoutGrid className="h-3 w-3" /> Explorar {ALL_NICHES.length}+ nichos
          </button>
          <span className="mx-1 text-[11px] text-slate-500">Populares:</span>
          {NICHE_SUGGESTIONS.slice(0, 6).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSearchDraft({ niche: s })}
              className={`chip transition hover:border-violet-400/40 hover:text-white ${
                niche === s ? "border-violet-400/50 bg-violet-500/15 text-white" : ""
              }`}
            >
              {s}
            </button>
          ))}
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-3">
          <EngineCard
            active={engine === "free"}
            icon={Cpu}
            title="Modo Gratis"
            subtitle="Scraping local · Google Maps + OSM"
            badge="Sin API Key"
            onClick={() => setEngine("free")}
          />
          <EngineCard
            active={engine === "google"}
            icon={MapPin}
            title="Google Places API"
            subtitle="Datos oficiales de Google"
            badge={googleReady ? "Configurado" : "Requiere clave"}
            warn={!googleReady}
            onClick={() => (googleReady ? setEngine("google") : openDialog("providers"))}
          />
          <EngineCard
            active={engine === "apify"}
            icon={Cloud}
            title="Apify Cloud"
            subtitle="Scraper masivo en la nube"
            badge={apifyReady ? "Configurado" : "Requiere clave"}
            warn={!apifyReady}
            onClick={() => (apifyReady ? setEngine("apify") : openDialog("providers"))}
          />
        </div>
        {apiMode && !engineHasKey && (
          <p className="mt-3 flex items-center gap-2 rounded-xl border border-amber-500/25 bg-amber-500/10 px-3.5 py-2.5 text-xs text-amber-200">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            Este proveedor no tiene API Key: se usará el scraping local gratuito como respaldo.
            {apiReady && (
              <button type="button" onClick={() => setEngine(preferredApiEngine(providerConfig))} className="underline">
                Usar el proveedor configurado
              </button>
            )}
          </p>
        )}

        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <Toggle
            checked={deepCrawl}
            onChange={setDeepCrawl}
            label="Rastreo profundo de sitios web"
            description="Visita la web de cada negocio para extraer correos, redes y WhatsApp. Más lento, pero mucho más completo."
          />
          <Toggle
            checked={skipDuplicates}
            onChange={setSkipDuplicates}
            label="Omitir empresas ya extraídas"
            description={`Evita repetir prospectos de búsquedas anteriores (${historyCount} en historial).`}
          />
          <Toggle
            checked={autoQueue}
            onChange={setAutoQueue}
            label="Enviar a la campaña automáticamente"
            description="Los prospectos con correo quedan listos en el Emisor al terminar la búsqueda o al enriquecerlos. Sin descargar ni subir archivos."
          />
        </div>

        <div className="mt-5 flex flex-col-reverse gap-3 border-t border-white/[0.06] pt-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3 text-xs text-slate-500">
            {historyCount > 0 && (
              <button
                type="button"
                onClick={() => {
                  if (window.confirm("¿Limpiar el historial de duplicados? Las próximas búsquedas podrán repetir empresas.")) {
                    clearHistory();
                    notify("success", "Historial de duplicados limpiado");
                  }
                }}
                className="btn btn-sm btn-ghost"
              >
                <History className="h-3.5 w-3.5" /> Limpiar historial ({historyCount})
              </button>
            )}
          </div>
          {loading ? (
            <button type="button" onClick={cancelSearch} className="btn btn-secondary">
              <X className="h-4 w-4" /> Cancelar búsqueda
            </button>
          ) : (
            <button type="submit" className="btn btn-primary px-8">
              <Search className="h-4 w-4" /> Buscar Prospectos
            </button>
          )}
        </div>
      </form>

      {loading && (
        <SearchProgress
          stage={cityStep ? `Ciudad ${cityStep.index} de ${cityStep.total}: ${cityStep.city} · ${stage}` : stage}
          elapsed={elapsed}
          expected={expected}
        />
      )}

      <ContactImportModal open={importOpen} onClose={() => setImportOpen(false)} target="search" />

      <NicheCatalog
        open={catalogOpen}
        onClose={() => setCatalogOpen(false)}
        onPick={(value) => {
          setSearchDraft({ niche: value });
          setCatalogOpen(false);
        }}
      />

      {!loading && error && (
        <div role="alert" className="card animate-fade-up flex flex-col items-center gap-3 border-rose-500/25 bg-rose-500/[0.06] p-6 text-center">
          <AlertTriangle className="h-6 w-6 text-rose-400" />
          <p className="text-sm text-rose-200">{error}</p>
          <button type="button" onClick={() => onSubmit()} className="btn btn-sm btn-secondary">
            <RotateCcw className="h-3.5 w-3.5" /> Reintentar
          </button>
        </div>
      )}

      {!loading && emptyInfo && (
        <div className="card animate-fade-up">
          <EmptyState
            icon={SearchX}
            title="No se encontraron resultados nuevos"
            description={
              emptyInfo.skipped > 0
                ? `Todos los resultados (${emptyInfo.skipped}) ya estaban en tu historial. Desactiva «Omitir empresas ya extraídas» o prueba otro nicho / zona.`
                : "Prueba con un nicho más general, otra ciudad cercana o el nombre del país."
            }
            action={
              emptyInfo.skipped > 0 ? (
                <button
                  type="button"
                  onClick={() => setSkipDuplicates(false)}
                  className="btn btn-sm btn-secondary"
                >
                  Incluir ya extraídas
                </button>
              ) : undefined
            }
          />
        </div>
      )}

      {!loading && prospects.length > 0 && (
        <section className="animate-fade-up space-y-3">
          {searchMeta && (
            <p className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <Sparkles className="h-3.5 w-3.5 text-violet-300" />
              {prospects.length} prospectos
              {searchMeta.cityName ? ` en ${searchMeta.cityName}` : ""}
              {searchMeta.countryName ? `, ${searchMeta.countryName}` : ""}
              {searchMeta.source && <span className="chip">Fuente: {searchMeta.source}</span>}
            </p>
          )}
          {sendableProspects.length > 0 && (
            <div className="flex flex-col gap-3 rounded-2xl border border-violet-500/25 bg-gradient-to-r from-violet-500/[0.10] to-cyan-400/[0.05] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="flex items-center gap-2 text-xs text-slate-300">
                <Send className="h-4 w-4 shrink-0 text-violet-300" />
                <span>
                  <b className="text-white">{readyCount}</b> de {sendableProspects.length} prospectos con correo están listos en tu
                  campaña{pendingQueue.length > 0 ? ` · ${pendingQueue.length} pendientes de añadir` : ""}.
                </span>
              </p>
              <div className="flex flex-wrap gap-2">
                {pendingQueue.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      const added = queueProspects(pendingQueue);
                      notify("success", `${added} destinatarios añadidos a la campaña`);
                    }}
                    className="btn btn-sm btn-secondary"
                  >
                    Añadir {pendingQueue.length} a la campaña
                  </button>
                )}
                {readyCount > 0 && (
                  <button type="button" onClick={() => setTab("sender")} className="btn btn-sm btn-primary">
                    <Send className="h-3.5 w-3.5" /> Ir a enviar ({recipients.length})
                  </button>
                )}
              </div>
            </div>
          )}
          <ResultsTable />
        </section>
      )}

      {!loading && !error && !emptyInfo && prospects.length === 0 && (
        <div className="card animate-fade-up">
          <EmptyState
            icon={Search}
            title="Lanza tu primera búsqueda"
            description="Escribe un nicho y una ciudad. En modo gratis no necesitas ninguna API Key; los resultados se guardan en este navegador."
            action={
              <button type="button" onClick={() => setImportOpen(true)} className="btn btn-sm btn-secondary">
                <DatabaseZap className="h-3.5 w-3.5" /> ¿Ya tienes una base? Impórtala
              </button>
            }
          />
        </div>
      )}
    </div>
  );
}

function EngineCard({
  active,
  icon: Icon,
  title,
  subtitle,
  badge,
  warn,
  onClick,
}: {
  active: boolean;
  icon: typeof Cpu;
  title: string;
  subtitle: string;
  badge: string;
  warn?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`group flex items-start gap-3 rounded-2xl border p-4 text-left transition ${
        active
          ? "border-violet-400/50 bg-gradient-to-br from-violet-500/15 to-indigo-500/5 ring-1 ring-violet-400/20"
          : "border-white/[0.07] bg-white/[0.015] hover:border-white/15 hover:bg-white/[0.03]"
      }`}
    >
      <span
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
          active ? "bg-violet-500/25 text-violet-200" : "bg-white/[0.05] text-slate-400"
        }`}
      >
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center justify-between gap-2">
          <span className={`text-sm font-semibold ${active ? "text-white" : "text-slate-300"}`}>{title}</span>
          <span
            className={`badge ${
              warn ? "border-amber-500/30 text-amber-300" : "border-emerald-500/30 text-emerald-300"
            }`}
          >
            {badge}
          </span>
        </span>
        <span className="mt-0.5 block text-[11px] text-slate-500">{subtitle}</span>
      </span>
    </button>
  );
}

function SearchProgress({ stage, elapsed, expected }: { stage: string; elapsed: number; expected: number }) {
  const progress = Math.min(95, Math.round((elapsed / Math.max(expected, 1)) * 100));
  return (
    <div className="card card-pad animate-fade-up" aria-live="polite">
      <div className="flex items-center gap-4">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-violet-500/15 text-violet-300">
          <Spinner className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-white">Buscando prospectos…</p>
          <p className="mt-0.5 truncate text-xs text-slate-400">{stage}</p>
        </div>
        <span className="text-xs font-medium text-slate-500 tabular-nums">
          {elapsed}s <span className="text-slate-700">/ ~{expected}s</span>
        </span>
      </div>
      <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/[0.05]">
        <div
          className="h-full rounded-full bg-gradient-to-r from-violet-500 via-indigo-400 to-cyan-400 transition-[width] duration-500"
          style={{ width: `${progress}%` }}
        />
      </div>
      <div className="mt-5 space-y-2.5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <div className="skeleton h-8 w-8 rounded-lg" />
            <div className="skeleton h-3 rounded" style={{ width: `${70 - (i % 3) * 14}%` }} />
          </div>
        ))}
      </div>
    </div>
  );
}

function NicheCatalog({
  open,
  onClose,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (niche: string) => void;
}) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const groups = NICHE_CATALOG.map((g) => ({
    ...g,
    niches: q ? g.niches.filter((n) => n.toLowerCase().includes(q) || g.sector.toLowerCase().includes(q)) : g.niches,
  })).filter((g) => g.niches.length > 0);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Explorar nichos"
      description="Elige un rubro o escribe cualquier otro en el buscador: el motor acepta cualquier nicho."
      className="max-w-3xl"
    >
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Buscar nicho o sector…"
        aria-label="Buscar nicho"
        className="input"
        autoFocus
      />
      <div className="mt-4 space-y-5">
        {groups.map((g) => (
          <div key={g.sector}>
            <p className="eyebrow">{g.sector}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {g.niches.map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => onPick(n)}
                  className="chip transition hover:border-violet-400/50 hover:bg-violet-500/15 hover:text-white"
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
        ))}
        {groups.length === 0 && (
          <div className="text-center text-xs text-slate-500">
            <p>No está en el catálogo, pero puedes buscarlo igual.</p>
            <button type="button" onClick={() => onPick(query.trim())} className="btn btn-sm btn-primary mt-3">
              Usar «{query.trim()}»
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
}
