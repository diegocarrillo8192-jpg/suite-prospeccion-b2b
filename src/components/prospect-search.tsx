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

const LIMITS = [10, 25, 50, 100];

export function ProspectSearch() {
  const { prospects, setProspects, selectedIds, transferSelected, clearSelection } = useAppState();
  const [niche, setNiche] = useState("");
  const [city, setCity] = useState("");
  const [limit, setLimit] = useState(25);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [skippedCount, setSkippedCount] = useState(0);
  const [meta, setMeta] = useState<ExtractionMeta | null>(null);
  const historyCount = useSyncExternalStore(subscribeHistory, getHistoryCount, getServerHistoryCount);

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
      const res = await fetch("/api/prospect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ niche: n, city: c, limit }),
      });
      const data = await res.json();

      if (!res.ok || data?.success !== true) {
        setProspects([]);
        setSkippedCount(0);
        setError(data?.message ?? "No se pudieron obtener resultados.");
        return;
      }

      const { fresh, skipped } = filterDuplicates(data.prospects ?? []);
      rememberProspects(fresh);
      setProspects(fresh);
      setSkippedCount(skipped);
      if (data.meta) setMeta(data.meta);
    } catch {
      setProspects([]);
      setSkippedCount(0);
      setError("Error de conexión al buscar prospectos.");
    } finally {
      setLoading(false);
    }
  }

  function onClearHistory() {
    clearHistory();
  }

  return (
    <div className="space-y-6">
      <form
        onSubmit={onSubmit}
        className="animate-fade-up rounded-2xl border border-slate-800 bg-[#0f172a] p-6"
      >
        <h2 className="text-lg font-semibold text-slate-100">Buscador de Prospectos</h2>
        <p className="mt-1 text-sm text-slate-400">
          Extracción real de empresas según nicho y ubicación (cualquier país).
        </p>

        <div className="mt-5 grid gap-4 sm:grid-cols-[1fr_1fr_auto_auto]">
          <Field
            label="Nicho / Rubro"
            value={niche}
            onChange={setNiche}
            placeholder="Ej: Restaurantes, Software, Clínicas…"
          />
          <Field
            label="Ubicación / Ciudad"
            value={city}
            onChange={setCity}
            placeholder="Ej: Panamá, Bogotá, CDMX, Miami…"
          />
          <div className="flex items-end gap-3">
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-slate-400">Cantidad</span>
              <select
                value={limit}
                onChange={(e) => setLimit(Number(e.target.value))}
                className="w-full rounded-xl border border-slate-700 bg-slate-900/60 px-3.5 py-2.5 text-sm text-slate-100 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20"
              >
                {LIMITS.map((l) => (
                  <option key={l} value={l}>
                    {l} prospectos
                  </option>
                ))}
              </select>
            </label>
            <button
              type="submit"
              disabled={loading}
              className="rounded-xl bg-sky-500 px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-sky-400 disabled:opacity-60"
            >
              {loading ? "Buscando…" : "Buscar Prospectos"}
            </button>
          </div>
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

      {loading && <SkeletonTable />}

      {error && !loading && (
        <div className="rounded-2xl border border-rose-900/60 bg-rose-950/20 p-6 text-center text-sm text-rose-300">
          {error}
        </div>
      )}

      {skippedCount > 0 && !loading && (
        <div className="flex items-center gap-2 rounded-xl border border-amber-900/50 bg-amber-950/20 px-4 py-2.5 text-sm text-amber-300">
          <span className="text-base">ℹ</span>
          Se omitieron {skippedCount} prospecto{skippedCount === 1 ? "" : "s"} ya extraído
          {skippedCount === 1 ? "" : "s"} previamente.
        </div>
      )}

      {!loading && searched && !error && prospects.length === 0 && (
        <div className="rounded-2xl border border-slate-800 bg-[#0f172a] p-10 text-center text-slate-400">
          No se encontraron resultados nuevos.
        </div>
      )}

      {!loading && prospects.length > 0 && (
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
              {selectedIds.length} de {prospects.length} seleccionados
            </p>
            <div className="flex flex-wrap gap-3">
              <button
                onClick={() => downloadCsv(prospects)}
                className="rounded-xl border border-slate-700 px-4 py-2 text-sm font-medium text-slate-200 transition hover:bg-slate-800"
              >
                Exportar CSV
              </button>
              <button
                onClick={transferSelected}
                disabled={selectedIds.length === 0}
                className="rounded-xl bg-indigo-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-400 disabled:opacity-50"
              >
                Transferir Lista a Emisor de Correos →
              </button>
            </div>
          </div>
        </div>
      )}
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
    <div className="animate-fade-in overflow-hidden rounded-2xl border border-slate-800 bg-[#0f172a]">
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
