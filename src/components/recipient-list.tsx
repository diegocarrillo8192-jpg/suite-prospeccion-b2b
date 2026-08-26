"use client";

import { useRef, useState, type ChangeEvent } from "react";
import { useAppState } from "./app-state";
import { parseCsv } from "@/lib/csv";
import { isValidEmail } from "@/lib/sanitize";
import type { Prospect } from "@/lib/types";

export function RecipientList() {
  const { recipients, addRecipients, removeRecipient } = useAppState();
  const fileRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const rows = parseCsv(String(reader.result ?? ""));
        const prospects: Prospect[] = rows
          .filter((r) => r.correo && isValidEmail(r.correo))
          .map((r, i) => ({
            id: `csv-${Date.now()}-${i}`,
            nombre: r.nombre || "Contacto",
            empresa: r.empresa || "Sin empresa",
            correo: r.correo ?? "",
            telefono: r.telefono || "",
            whatsapp: r.whatsapp || r.telefono || "",
            direccion: r.direccion || "",
            website: r.website || "",
            ciudad: r.ciudad || "",
            rubro: r.rubro || "",
          }));

        if (prospects.length === 0) {
          setError("No se encontraron correos válidos en el archivo.");
        } else {
          addRecipients(prospects);
          setError(null);
        }
      } catch {
        setError("No se pudo procesar el archivo CSV.");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  return (
    <div>
      {recipients.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-700 py-10 text-center">
          <p className="text-sm text-slate-400">Aún no hay destinatarios.</p>
          <p className="mt-1 text-xs text-slate-600">
            Transfiere prospectos desde el buscador o carga un CSV.
          </p>
          <button
            onClick={() => fileRef.current?.click()}
            className="mt-4 rounded-xl border border-slate-700 px-4 py-2 text-sm font-medium text-slate-200 transition hover:bg-slate-800"
          >
            Cargar archivo CSV
          </button>
        </div>
      ) : (
        <div>
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm text-slate-300">
              <span className="font-semibold text-slate-100">{recipients.length}</span> destinatarios
            </p>
            <button
              onClick={() => fileRef.current?.click()}
              className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:bg-slate-800"
            >
              + Cargar CSV
            </button>
          </div>
          <ul className="max-h-72 space-y-2 overflow-y-auto pr-1">
            {recipients.map((r) => (
              <li
                key={r.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-900/40 px-4 py-2.5"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-100">
                    {r.nombre} · {r.empresa}
                  </p>
                  <p className="truncate text-xs text-slate-500">
                    {r.correo}
                    {r.ciudad ? ` · ${r.ciudad}` : ""}
                  </p>
                </div>
                <button
                  onClick={() => removeRecipient(r.id)}
                  className="shrink-0 rounded-lg p-1.5 text-slate-500 transition hover:bg-slate-800 hover:text-slate-200"
                  aria-label="Quitar destinatario"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <input
        ref={fileRef}
        type="file"
        accept=".csv,text/csv"
        onChange={onFile}
        className="hidden"
      />
      {error && <p className="mt-3 text-xs text-rose-400">{error}</p>}
    </div>
  );
}
