"use client";

import { useMemo, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { AlertTriangle, FileUp, Search, UploadCloud, X } from "lucide-react";
import { hasValidEmail, useAppState } from "./app-state";
import { parseCsv } from "@/lib/csv";
import { isValidEmail } from "@/lib/sanitize";
import type { Prospect } from "@/lib/types";

const SAMPLE_CSV = "nombre,empresa,correo,ciudad,rubro\nAna Pérez,Acme SA,ana@acme.com,Ciudad de Panamá,Software\n";

export function RecipientList() {
  const { recipients, addRecipients, removeRecipient, setTab, contactedEmails } = useAppState();
  const fileRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [filter, setFilter] = useState("");

  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return recipients;
    return recipients.filter((r) => `${r.nombre} ${r.empresa} ${r.correo} ${r.ciudad}`.toLowerCase().includes(q));
  }, [recipients, filter]);

  function loadFile(file: File) {
    if (!/\.(csv|txt)$/i.test(file.name) && file.type && !file.type.includes("csv") && !file.type.includes("text")) {
      setError("El archivo debe ser un CSV (.csv).");
      setNotice(null);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const rows = parseCsv(String(reader.result ?? ""));
        const stamp = Date.now();
        const prospects: Prospect[] = rows
          .filter((r) => r.correo && isValidEmail(r.correo))
          .map((r, i) => ({
            id: `csv-${stamp}-${i}`,
            nombre: r.nombre || "",
            empresa: r.empresa || "Sin empresa",
            correo: (r.correo ?? "").trim(),
            telefono: r.telefono || "",
            whatsapp: r.whatsapp || r.telefono || "",
            direccion: r.direccion || "",
            website: r.website || "",
            ciudad: r.ciudad || "",
            rubro: r.rubro || "",
          }));

        if (prospects.length === 0) {
          setError("No se encontraron correos válidos en el archivo. Asegúrate de tener una columna «correo» o «email».");
          setNotice(null);
          return;
        }
        const added = addRecipients(prospects);
        const ignored = rows.length - prospects.length;
        const dupes = prospects.length - added;
        setError(null);
        setNotice(
          `${added} contacto${added === 1 ? "" : "s"} importado${added === 1 ? "" : "s"} automáticamente desde ${file.name}.` +
            (dupes > 0 ? ` ${dupes} duplicado${dupes === 1 ? "" : "s"} omitido${dupes === 1 ? "" : "s"}.` : "") +
            (ignored > 0 ? ` ${ignored} fila${ignored === 1 ? "" : "s"} sin correo válido.` : "")
        );
      } catch {
        setError("No se pudo procesar el archivo CSV.");
        setNotice(null);
      }
    };
    reader.readAsText(file);
  }

  function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) loadFile(file);
    e.target.value = "";
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) loadFile(file);
  }

  function downloadSample() {
    const blob = new Blob(["﻿" + SAMPLE_CSV], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "plantilla-destinatarios.csv";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <div>
      {recipients.length === 0 ? (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={`flex flex-col items-center justify-center rounded-2xl border border-dashed px-6 py-10 text-center transition ${
            dragging ? "border-violet-400 bg-violet-500/10" : "border-white/15 bg-white/[0.01]"
          }`}
        >
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-500/15 text-violet-300">
            <UploadCloud className="h-6 w-6" />
          </span>
          <p className="mt-3 text-sm text-slate-300">Arrastra tu CSV aquí o selecciónalo manualmente.</p>
          <p className="mt-1 text-xs text-slate-500">Detectamos automáticamente nombre, empresa, correo y ciudad.</p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            <button type="button" onClick={() => fileRef.current?.click()} className="btn btn-sm btn-primary">
              <FileUp className="h-3.5 w-3.5" /> Cargar archivo CSV
            </button>
            <button type="button" onClick={() => setTab("search")} className="btn btn-sm btn-secondary">
              <Search className="h-3.5 w-3.5" /> Buscar prospectos
            </button>
          </div>
          <button type="button" onClick={downloadSample} className="mt-3 text-[11px] text-slate-500 underline hover:text-slate-300">
            Descargar plantilla CSV de ejemplo
          </button>
        </div>
      ) : (
        <div>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-slate-300">
              <span className="font-semibold text-white">{recipients.length}</span> destinatarios
            </p>
            <div className="flex items-center gap-2">
              {recipients.length > 6 && (
                <input
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  placeholder="Buscar…"
                  aria-label="Buscar destinatarios"
                  className="input w-40 py-1.5 text-xs"
                />
              )}
              <button type="button" onClick={() => fileRef.current?.click()} className="btn btn-sm btn-secondary">
                + Cargar CSV
              </button>
            </div>
          </div>
          <ul className="max-h-80 space-y-1.5 overflow-y-auto pr-1">
            {visible.map((r) => {
              const valid = hasValidEmail(r);
              const contacted = valid && contactedEmails.has(r.correo.trim().toLowerCase());
              const initials = (r.empresa || r.nombre || "?").trim().slice(0, 2).toUpperCase();
              return (
                <li
                  key={r.id}
                  className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 ${
                    valid ? "border-white/[0.06] bg-white/[0.02]" : "border-amber-500/20 bg-amber-500/[0.04]"
                  }`}
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500/25 to-cyan-400/10 text-[11px] font-bold text-violet-200">
                    {initials}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-100">
                      {r.nombre ? `${r.nombre} · ${r.empresa}` : r.empresa}
                    </p>
                    <p className="truncate text-xs text-slate-500">
                      {valid ? r.correo : "Sin correo válido"}
                      {r.ciudad ? ` · ${r.ciudad}` : ""}
                    </p>
                  </div>
                  {!valid && <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400" aria-label="Se omitirá" />}
                  {contacted && <span className="badge shrink-0 border-violet-500/30 text-[10px] text-violet-300">Ya contactado</span>}
                  <button
                    type="button"
                    onClick={() => removeRecipient(r.id)}
                    className="shrink-0 rounded-lg p-1.5 text-slate-500 transition hover:bg-white/10 hover:text-slate-200"
                    aria-label="Quitar destinatario"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <input ref={fileRef} type="file" accept=".csv,text/csv" onChange={onFile} className="hidden" />
      {notice && <p className="mt-3 text-xs text-emerald-400">{notice}</p>}
      {error && <p className="mt-3 text-xs text-rose-400">{error}</p>}
    </div>
  );
}
