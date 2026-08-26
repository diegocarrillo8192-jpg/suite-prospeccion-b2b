"use client";

import { useState, type FormEvent } from "react";
import { useAppState } from "./app-state";
import { generateLeads } from "@/lib/leads";
import { sanitizeText } from "@/lib/sanitize";
import { ResultsTable } from "./results-table";
import { downloadCsv } from "@/lib/csv";

export function ProspectSearch() {
  const { prospects, setProspects, selectedIds, transferSelected } = useAppState();
  const [niche, setNiche] = useState("");
  const [city, setCity] = useState("");
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const n = sanitizeText(niche);
    const c = sanitizeText(city);
    if (!n && !c) return;

    setLoading(true);
    setSearched(true);
    setTimeout(() => {
      setProspects(generateLeads(n || "Negocios", c || "Buenos Aires"));
      setLoading(false);
    }, 600);
  }

  return (
    <div className="space-y-6">
      <form
        onSubmit={onSubmit}
        className="animate-fade-up rounded-2xl border border-slate-800 bg-[#0f172a] p-6"
      >
        <h2 className="text-lg font-semibold text-slate-100">Buscador de Prospectos</h2>
        <p className="mt-1 text-sm text-slate-400">Encuentra empresas según nicho y ubicación.</p>

        <div className="mt-5 grid gap-4 sm:grid-cols-[1fr_1fr_auto]">
          <Field
            label="Nicho / Rubro"
            value={niche}
            onChange={setNiche}
            placeholder="Ej: Software, Restaurantes, Salud…"
          />
          <Field
            label="Ubicación / Ciudad"
            value={city}
            onChange={setCity}
            placeholder="Ej: Buenos Aires, CDMX…"
          />
          <div className="flex items-end">
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-sky-500 px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-sky-400 disabled:opacity-60 sm:w-auto"
            >
              {loading ? "Buscando…" : "Buscar Prospectos"}
            </button>
          </div>
        </div>
      </form>

      {loading && <SkeletonTable />}

      {!loading && searched && prospects.length === 0 && (
        <div className="rounded-2xl border border-slate-800 bg-[#0f172a] p-10 text-center text-slate-400">
          No se encontraron resultados.
        </div>
      )}

      {!loading && prospects.length > 0 && (
        <div className="animate-fade-up">
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
