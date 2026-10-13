"use client";

import { useMemo, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { AlertTriangle, ClipboardPaste, FileUp, Search, UploadCloud, UserPlus, X } from "lucide-react";
import { hasValidEmail, isSendable, useAppState } from "./app-state";
import { ProspectPicker } from "./prospect-picker";
import { ContactImportModal, describeImport, downloadImportTemplate, useContactImport } from "./contact-import";
import { IMPORT_ACCEPT } from "@/lib/import-contacts";

export function RecipientList() {
  const { recipients, removeRecipient, setTab, contactedEmails, autoQueue, library, suppressedSet } = useAppState();
  const [pickerOpen, setPickerOpen] = useState(false);
  const available = useMemo(() => {
    const inList = new Set(recipients.map((r) => (r.correo ?? "").trim().toLowerCase()));
    return library.filter((p) => {
      const email = p.correo.trim().toLowerCase();
      return !inList.has(email) && !suppressedSet.has(email);
    }).length;
  }, [library, recipients, suppressedSet]);
  const { importFile } = useContactImport("campaign");
  const fileRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [filter, setFilter] = useState("");
  const [pasteOpen, setPasteOpen] = useState(false);

  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return recipients;
    return recipients.filter((r) => `${r.nombre} ${r.empresa} ${r.correo} ${r.ciudad}`.toLowerCase().includes(q));
  }, [recipients, filter]);

  async function loadFile(file: File) {
    try {
      const report = await importFile(file);
      if (report.queued + report.duplicates === 0 && report.findable === 0) {
        setError("No se encontraron correos válidos en el archivo. Asegúrate de tener una columna «correo» o «email».");
        setNotice(null);
        return;
      }
      setError(null);
      setNotice(describeImport(report, "campaign"));
    } catch (err) {
      setError((err as Error).message || "No se pudo procesar el archivo.");
      setNotice(null);
    }
  }

  function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) void loadFile(file);
    e.target.value = "";
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void loadFile(file);
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
          <p className="mt-3 text-sm text-slate-300">Arrastra tu base de datos (Excel o CSV) aquí o selecciónala manualmente.</p>
          <p className="mt-1 text-xs text-slate-500">
            Detectamos automáticamente nombre, empresa, correo y ciudad.
            {autoQueue ? " Los prospectos con correo que encuentres en el Buscador también aparecen aquí solos." : ""}
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            <button type="button" onClick={() => fileRef.current?.click()} className={`btn btn-sm ${library.length > 0 ? "btn-secondary" : "btn-primary"}`}>
              <FileUp className="h-3.5 w-3.5" /> Subir Excel / CSV
            </button>
            <button type="button" onClick={() => setPasteOpen(true)} className="btn btn-sm btn-secondary">
              <ClipboardPaste className="h-3.5 w-3.5" /> Pegar lista
            </button>
            {library.length > 0 ? (
              <button type="button" onClick={() => setPickerOpen(true)} className="btn btn-sm btn-primary order-first">
                <UserPlus className="h-3.5 w-3.5" /> Cargar del Buscador ({available})
              </button>
            ) : (
              <button type="button" onClick={() => setTab("search")} className="btn btn-sm btn-secondary">
                <Search className="h-3.5 w-3.5" /> Buscar prospectos
              </button>
            )}
          </div>
          <button type="button" onClick={downloadImportTemplate} className="mt-3 text-[11px] text-slate-500 underline hover:text-slate-300">
            Descargar plantilla de ejemplo
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
              <button
                type="button"
                onClick={() => setPickerOpen(true)}
                className="btn btn-sm btn-primary"
                title="Elegir contactos encontrados en el Buscador"
              >
                <UserPlus className="h-3.5 w-3.5" /> Cargar del Buscador{available ? ` (${available})` : ""}
              </button>
              <button type="button" onClick={() => setPasteOpen(true)} className="btn btn-sm btn-ghost" title="Pegar correos o una tabla">
                <ClipboardPaste className="h-3.5 w-3.5" /> Pegar
              </button>
              <button type="button" onClick={() => fileRef.current?.click()} className="btn btn-sm btn-secondary">
                <FileUp className="h-3.5 w-3.5" /> Subir base
              </button>
            </div>
          </div>
          <ul className="max-h-80 space-y-1.5 overflow-y-auto pr-1">
            {visible.map((r) => {
              const valid = isSendable(r);
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
                      {valid ? r.correo : hasValidEmail(r) ? `${r.correo} · rebotaría (validación)` : "Sin correo válido"}
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

      <input ref={fileRef} type="file" accept={IMPORT_ACCEPT} onChange={onFile} className="hidden" />
      <ProspectPicker open={pickerOpen} onClose={() => setPickerOpen(false)} />
      <ContactImportModal open={pasteOpen} onClose={() => setPasteOpen(false)} target="campaign" initialMode="paste" />
      {notice && <p className="mt-3 text-xs text-emerald-400">{notice}</p>}
      {error && <p className="mt-3 text-xs text-rose-400">{error}</p>}
    </div>
  );
}
