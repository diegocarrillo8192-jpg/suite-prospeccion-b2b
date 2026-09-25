"use client";

import { useState, useSyncExternalStore, type FormEvent } from "react";
import { useAppState } from "./app-state";
import { sanitizeText } from "@/lib/sanitize";
import { ResultsTable } from "./results-table";
import { downloadCsv } from "@/lib/csv";
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
}

async function requestProspects(params: SearchRequest): Promise<SearchOutcome> {
  const res = await fetch("/api/prospect", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  const data = await res.json();
  if (!res.ok || data?.success !== true) {
    return { ok: false, message: data?.message ?? "No se pudieron obtener resultados." };
  }
  return { ok: true, prospects: data.prospects ?? [], meta: data.meta };
}

function engineHint(engine: EngineId, apifyReady: boolean, googleReady: boolean): string {
  if (engine === "apify") {
    return apifyReady
      ? "Modo API: usará tu actor de Google Maps en la nube de Apify."
      : "Modo API sin clave: se activará automáticamente el scraping local sin costo.";
  }
  if (engine === "google") {
    return googleReady
      ? "Modo API: usará la API oficial de Google Places (requiere facturación activa)."
      : "Modo API sin clave: se activará automáticamente el scraping local sin costo.";
  }
  return "Modo Gratis: scraping local con Playwright (Google Maps) + OpenStreetMap. Sin API Key ni créditos. Extrae email, WhatsApp y redes de cada sitio web.";
}

function useProspectSearch() {
  const { prospects, setProspects, selectedIds, transferSelected, clearSelection } = useAppState();
  const providerConfig = useSyncExternalStore(
    subscribeProviders,
    getProvidersSnapshot,
    getServerProvidersSnapshot
  );
  const [niche, setNiche] = useState("");
  const [city, setCity] = useState("");
  const [limit, setLimit] = useState(25);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [skippedCount, setSkippedCount] = useState(0);
  const [meta, setMeta] = useState<ExtractionMeta | null>(null);
  const historyCount = useSyncExternalStore(subscribeHistory, getHistoryCount, getServerHistoryCount);

  const engine = providerConfig.engine;
  const apiMode = isApiMode(engine);
  const apiReady = hasAnyApiKey(providerConfig);
  const apiFallback = preferredApiEngine(providerConfig);
  const apifyReady = providerConfig.apifyToken.trim().length > 0;
  const googleReady = providerConfig.googleKey.trim().length > 0;

  function setEngine(next: EngineId) {
    saveProviderConfig({ ...providerConfig, engine: next });
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const n = sanitizeText(niche);
    const c = sanitizeText(city);
    if (!c) {
      setError("Indica una ubicación / ciudad para buscar.");
      setSearched(true);
      return;
    }
    setLoading(true);
    setSearched(true);
    setError(null);
    setMeta(null);
    clearSelection();

    try {
      const result = await requestProspects({
        niche: n,
        city: c,
        limit,
        engine,
        apifyToken: providerConfig.apifyToken,
        apifyActor: providerConfig.apifyActor,
        googleKey: providerConfig.googleKey,
      });
      if (!result.ok) {
        setProspects([]);
        setSkippedCount(0);
        setError(result.message);
        return;
      }
      const { fresh, skipped } = filterDuplicates(result.prospects);
      rememberProspects(fresh);
      setProspects(fresh);
      setSkippedCount(skipped);
      setMeta(result.meta ?? null);
    } catch {
      setProspects([]);
      setSkippedCount(0);
      setError("Error de conexión al buscar prospectos.");
    } finally {
      setLoading(false);
    }
  }

  return {
    prospects,
    setProspects,
    selectedIds,
    transferSelected,
    niche,
    setNiche,
    city,
    setCity,
    limit,
    setLimit,
    loading,
    searched,
    error,
    skippedCount,
    meta,
    historyCount,
    engine,
    apiMode,
    apiReady,
    apiFallback,
    apifyReady,
    googleReady,
    setEngine,
    onSubmit,
    onClearHistory: clearHistory,
  };
}

export function ProspectSearch({ onOpenSettings }: { onOpenSettings: () => void }) {
  const s = useProspectSearch();
  const showError = Boolean(s.error) && !s.loading;
  const showSkipped = s.skippedCount > 0 && !s.loading;
  const showEmpty = !s.loading && s.searched && !s.error && s.prospects.length === 0;
  const showResults = !s.loading && s.prospects.length > 0;

  return (
    <div className="space-y-6">
      <SearchForm
        niche={s.niche}
        city={s.city}
        limit={s.limit}
        engine={s.engine}
        apiMode={s.apiMode}
        apiReady={s.apiReady}
        apiFallback={s.apiFallback}
        apifyReady={s.apifyReady}
        googleReady={s.googleReady}
        loading={s.loading}
        historyCount={s.historyCount}
        onNiche={s.setNiche}
        onCity={s.setCity}
        onLimit={s.setLimit}
        onEngine={s.setEngine}
        onSubmit={s.onSubmit}
        onClearHistory={s.onClearHistory}
        onOpenSettings={onOpenSettings}
      />

      {s.loading && <SkeletonTable />}

      {showError && <ErrorNotice message={s.error ?? ""} />}

      {showSkipped && <SkippedNotice count={s.skippedCount} />}

      {showEmpty && <EmptyState />}

      {showResults && (
        <ResultsSection
          prospects={s.prospects}
          selectedCount={s.selectedIds.length}
          meta={s.meta}
          onExport={() => downloadCsv(s.prospects)}
          onTransfer={s.transferSelected}
        />
      )}
    </div>
  );
}

function SearchForm({
  niche,
  city,
  limit,
  engine,
  apiMode,
  apiReady,
  apiFallback,
  apifyReady,
  googleReady,
  loading,
  historyCount,
  onNiche,
  onCity,
  onLimit,
  onEngine,
  onSubmit,
  onClearHistory,
  onOpenSettings,
}: {
  niche: string;
  city: string;
  limit: number;
  engine: EngineId;
  apiMode: boolean;
  apiReady: boolean;
  apiFallback: EngineId;
  apifyReady: boolean;
  googleReady: boolean;
  loading: boolean;
  historyCount: number;
  onNiche: (v: string) => void;
  onCity: (v: string) => void;
  onLimit: (n: number) => void;
  onEngine: (e: EngineId) => void;
  onSubmit: (e: FormEvent<HTMLFormElement>) => void;
  onClearHistory: () => void;
  onOpenSettings: () => void;
}) {
  return (
    <form
      onSubmit={onSubmit}
      className="animate-fade-up rounded-2xl border border-white/10 bg-white/[0.03] p-6 shadow-xl shadow-black/20 backdrop-blur-xl"
    >
      <h2 className="text-lg font-semibold text-slate-100">Buscador de Prospectos</h2>
      <p className="mt-1 text-sm text-slate-400">
        Extracción real de empresas según nicho y ubicación (cualquier país).
      </p>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <Field
          label="Nicho / Rubro"
          value={niche}
          onChange={onNiche}
          placeholder="Ej: Restaurantes, Software, Clínicas…"
        />
        <Field
          label="Ubicación / Ciudad"
          value={city}
          onChange={onCity}
          placeholder="Ej: Panamá, Bogotá, CDMX, Miami…"
        />
      </div>

      <div className="mt-4">
        <span className="mb-1.5 block text-xs font-medium text-slate-400">Modo de búsqueda</span>
        <div className="grid gap-2 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => onEngine("free")}
            className={`rounded-xl border px-4 py-3 text-left transition ${
              apiMode
                ? "border-slate-700 text-slate-400 hover:bg-slate-800/60"
                : "border-sky-500/50 bg-sky-500/10 text-sky-200"
            }`}
          >
            <span className="block text-sm font-semibold">Modo Gratis (Scraping Local)</span>
            <span className="mt-0.5 block text-[11px] opacity-80">
              Playwright · Sin créditos ni claves
            </span>
          </button>
          <button
            type="button"
            onClick={() => onEngine(apiFallback === "free" ? "apify" : apiFallback)}
            className={`rounded-xl border px-4 py-3 text-left transition ${
              apiMode
                ? "border-sky-500/50 bg-sky-500/10 text-sky-200"
                : "border-slate-700 text-slate-400 hover:bg-slate-800/60"
            }`}
          >
            <span className="block text-sm font-semibold">Modo API Key</span>
            <span className="mt-0.5 block text-[11px] opacity-80">
              {apiReady ? "Apify / Google Places" : "Sin clave · usa Ajustes"}
            </span>
          </button>
        </div>
      </div>

      {apiMode && (
        <label className="mt-3 block">
          <span className="mb-1.5 block text-xs font-medium text-slate-400">Proveedor API</span>
          <select
            value={engine}
            onChange={(e) => onEngine(e.target.value as EngineId)}
            className="w-full rounded-xl border border-slate-700 bg-slate-900/60 px-3.5 py-2.5 text-sm text-slate-100 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20"
          >
            <option value="apify">Apify Cloud API{apifyReady ? "" : " — sin API Key"}</option>
            <option value="google">Google Places API{googleReady ? "" : " — sin API Key"}</option>
          </select>
        </label>
      )}

      <div className="mt-4 grid gap-4 sm:grid-cols-[auto_auto]">
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-slate-400">Cantidad</span>
          <select
            value={limit}
            onChange={(e) => onLimit(Number(e.target.value))}
            className="w-full rounded-xl border border-slate-700 bg-slate-900/60 px-3.5 py-2.5 text-sm text-slate-100 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20"
          >
            {LIMITS.map((l) => (
              <option key={l} value={l}>
                {l} prospectos
              </option>
            ))}
          </select>
        </label>

        <div className="flex items-end">
          <button
            type="submit"
            disabled={loading}
            className="h-[42px] rounded-xl bg-sky-500 px-6 text-sm font-semibold text-white transition hover:bg-sky-400 disabled:opacity-60"
          >
            {loading ? "Buscando…" : "Buscar Prospectos"}
          </button>
        </div>
      </div>

      {!apiMode && (
        <p className="mt-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-2 text-xs text-emerald-300">
          Modo Gratis activo: no requiere créditos ni claves de API. Scraping local de Google Maps
          con Playwright + extracción profunda de correos, WhatsApp y redes sociales de cada sitio
          web.
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-slate-500">{engineHint(engine, apifyReady, googleReady)}</p>
        <button
          type="button"
          onClick={onOpenSettings}
          className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:bg-slate-800 hover:text-slate-100"
        >
          Configurar Proveedores / APIs
        </button>
      </div>

      {historyCount > 0 && (
        <div className="mt-4 flex items-center justify-between rounded-xl border border-slate-800 bg-slate-900/40 px-4 py-2">
          <p className="text-xs text-slate-500">
            Memoria de prospección activa · {historyCount} empresas en el historial.
          </p>
          <button
            type="button"
            onClick={onClearHistory}
            className="rounded-lg px-3 py-1.5 text-xs font-medium text-slate-400 transition hover:bg-slate-800 hover:text-slate-200"
          >
            Limpiar Historial de Duplicados
          </button>
        </div>
      )}
    </form>
  );
}

function ErrorNotice({ message }: { message: string }) {
  return (
    <div className="rounded-2xl border border-rose-900/60 bg-rose-950/20 p-6 text-center text-sm text-rose-300">
      {message}
    </div>
  );
}

function SkippedNotice({ count }: { count: number }) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-amber-900/50 bg-amber-950/20 px-4 py-2.5 text-sm text-amber-300">
      <span className="text-base">ℹ</span>
      Se omitieron {count} prospecto{count === 1 ? "" : "s"} ya extraído
      {count === 1 ? "" : "s"} previamente.
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-10 text-center text-slate-400 shadow-xl shadow-black/20 backdrop-blur-xl">
      No se encontraron resultados nuevos.
    </div>
  );
}

function ResultsSection({
  prospects,
  selectedCount,
  meta,
  onExport,
  onTransfer,
}: {
  prospects: Prospect[];
  selectedCount: number;
  meta: ExtractionMeta | null;
  onExport: () => void;
  onTransfer: () => void;
}) {
  return (
    <div className="animate-fade-up">
      {meta && (
        <p className="mb-3 text-xs text-slate-500">
          {prospects.length} resultado{prospects.length === 1 ? "" : "s"} real
          {prospects.length === 1 ? "" : "es"} en {meta.cityName}, {meta.countryName} · Fuente:{" "}
          {meta.source}
        </p>
      )}
      <ResultsTable />
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-400">
          {selectedCount} de {prospects.length} seleccionados
        </p>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={onExport}
            className="rounded-xl border border-slate-700 px-4 py-2 text-sm font-medium text-slate-200 transition hover:bg-slate-800"
          >
            Exportar CSV
          </button>
          <button
            onClick={onTransfer}
            disabled={selectedCount === 0}
            className="rounded-xl bg-indigo-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-400 disabled:opacity-50"
          >
            Transferir Lista a Emisor de Correos →
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-slate-400">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-xl border border-slate-700 bg-slate-900/60 px-3.5 py-2.5 text-sm text-slate-100 placeholder:text-slate-600 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20"
      />
    </label>
  );
}

function SkeletonTable() {
  return (
    <div className="animate-fade-in overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] shadow-xl shadow-black/20 backdrop-blur-xl">
      <div className="space-y-3 p-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="h-4 animate-pulse rounded bg-slate-800/70"
            style={{ width: `${80 - (i % 4) * 12}%` }}
          />
        ))}
      </div>
    </div>
  );
}
