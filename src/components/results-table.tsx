"use client";

import { useAppState } from "./app-state";
import { formatPhoneForWa, mapsUrl } from "@/lib/format";

export function ResultsTable() {
  const { prospects, selectedIds, toggleSelect, selectAll } = useAppState();
  const selectedSet = new Set(selectedIds);
  const allSelected = prospects.length > 0 && selectedIds.length === prospects.length;

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-800 bg-[#0f172a]">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[920px] border-collapse text-left text-sm">
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
              <th className="px-3 py-3 font-medium">WhatsApp</th>
              <th className="px-3 py-3 font-medium">Dirección</th>
              <th className="px-3 py-3 font-medium">Sitio Web</th>
            </tr>
          </thead>
          <tbody>
            {prospects.map((p) => {
              const sel = selectedSet.has(p.id);
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
                  <td className="px-3 py-3 text-slate-300">{p.correo}</td>
                  <td className="px-3 py-3 text-slate-300">{p.telefono}</td>
                  <td className="px-3 py-3">
                    <a
                      href={`https://wa.me/${formatPhoneForWa(p.whatsapp)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500/15 px-2.5 py-1 text-xs font-medium text-emerald-300 transition hover:bg-emerald-500/25"
                    >
                      WhatsApp
                    </a>
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
                    <a
                      href={p.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="text-sky-400 hover:underline"
                    >
                      {p.website.replace(/^https?:\/\//, "")}
                    </a>
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
