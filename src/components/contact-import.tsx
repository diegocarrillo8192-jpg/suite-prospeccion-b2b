"use client";

import { useRef, useState, type DragEvent } from "react";
import { ClipboardPaste, FileSpreadsheet, FileUp, Search, UploadCloud } from "lucide-react";
import { useAppState } from "./app-state";
import { Modal } from "./modal";
import { Spinner } from "./ui";
import { parsePastedContacts, type ContactField, type MappedRows } from "@/lib/csv";
import { FIELD_LABELS, IMPORT_ACCEPT, readContactsFile, toProspects } from "@/lib/import-contacts";

export type ImportTarget = "campaign" | "search";

export interface ImportReport {
  source: string;
  /** Contactos con correo que entraron a la lista de envío. */
  queued: number;
  /** Contactos agregados a los resultados del Buscador. */
  listed: number;
  /** Con correo, pero ya estaban en la lista. */
  duplicates: number;
  /** Sin correo pero con web: el Buscador puede encontrar su correo. */
  findable: number;
  /** Filas sin correo ni web. */
  discarded: number;
  detected: ContactField[];
}

const SAMPLE_CSV =
  "nombre,empresa,correo,telefono,ciudad,rubro,website\nAna Pérez,Acme SA,ana@acme.com,+507 6000 0000,Ciudad de Panamá,Software,acme.com\n";

export function downloadImportTemplate() {
  const blob = new Blob(["﻿" + SAMPLE_CSV], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "plantilla-contactos.csv";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Importa una base de datos propia. Con destino «campaign» los contactos con
 * correo van directo a la lista de envío; con destino «search» se suman a los
 * resultados del Buscador (y a la campaña si el envío automático está activo).
 * En ambos casos, los que solo tienen sitio web pasan al Buscador para
 * encontrarles el correo con «Enriquecer».
 */
export function useContactImport(target: ImportTarget) {
  const { addRecipients, appendProspects, queueProspects, autoQueue } = useAppState();

  function apply(mapped: MappedRows, source: string): ImportReport {
    const split = toProspects(mapped.rows, "imp");
    let queued = 0;
    let listed = 0;
    if (target === "campaign") {
      queued = addRecipients(split.withEmail);
      listed = appendProspects(split.findable);
    } else {
      listed = appendProspects([...split.withEmail, ...split.findable]);
      if (autoQueue) queued = queueProspects(split.withEmail);
    }
    return {
      source,
      queued,
      listed,
      duplicates: target === "campaign" ? split.withEmail.length - queued : 0,
      findable: split.findable.length,
      discarded: split.discarded,
      detected: mapped.detected,
    };
  }

  async function importFile(file: File): Promise<ImportReport> {
    const mapped = await readContactsFile(file);
    return apply(mapped, file.name);
  }

  function importText(text: string): ImportReport {
    return apply(parsePastedContacts(text), "la lista pegada");
  }

  return { importFile, importText };
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Resumen legible del resultado de una importación. */
export function describeImport(r: ImportReport, target: ImportTarget): string {
  const parts: string[] = [];
  if (target === "campaign") {
    parts.push(`${plural(r.queued, "contacto importado", "contactos importados")} automáticamente desde ${r.source}.`);
    if (r.duplicates > 0) parts.push(`${plural(r.duplicates, "duplicado omitido", "duplicados omitidos")}.`);
    if (r.findable > 0) {
      parts.push(`${plural(r.findable, "contacto sin correo pero con web pasó", "contactos sin correo pero con web pasaron")} al Buscador para encontrar su correo.`);
    }
  } else {
    parts.push(`${plural(r.listed, "contacto agregado", "contactos agregados")} al Buscador desde ${r.source}.`);
    if (r.queued > 0) parts.push(`${plural(r.queued, "quedó listo", "quedaron listos")} para la campaña.`);
    if (r.findable > 0) parts.push(`Usa «Enriquecer» para encontrar el correo de ${plural(r.findable, "contacto", "contactos")} sin correo.`);
  }
  if (r.discarded > 0) parts.push(`${plural(r.discarded, "fila", "filas")} sin correo ni web.`);
  return parts.join(" ");
}

/** Ventana para importar una base de datos: archivo (Excel/CSV) o texto pegado. */
export function ContactImportModal({
  open,
  onClose,
  target,
  initialMode = "file",
}: {
  open: boolean;
  onClose: () => void;
  target: ImportTarget;
  initialMode?: "file" | "paste";
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Importar base de datos"
      description={
        target === "campaign"
          ? "Los contactos con correo quedan listos para el envío al instante."
          : "Tus contactos se suman a los resultados para enriquecerlos, validarlos y enviarles campañas."
      }
      className="max-w-2xl"
    >
      <ImportBody target={target} initialMode={initialMode} onDone={onClose} />
    </Modal>
  );
}

function ImportBody({
  target,
  initialMode,
  onDone,
}: {
  target: ImportTarget;
  initialMode: "file" | "paste";
  onDone: () => void;
}) {
  const { notify, setTab } = useAppState();
  const { importFile, importText } = useContactImport(target);
  const fileRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState(initialMode);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<ImportReport | null>(null);

  const preview = mode === "paste" && text.trim() ? parsePastedContacts(text) : null;
  const previewEmails = preview ? preview.rows.filter((r) => r.correo).length : 0;

  function finish(r: ImportReport) {
    setReport(r);
    const ok = r.queued + r.listed > 0;
    notify(ok ? "success" : "info", ok ? "Base de datos importada" : "No había contactos nuevos", describeImport(r, target));
  }

  async function onFile(file: File) {
    setBusy(true);
    setError(null);
    setReport(null);
    try {
      finish(await importFile(file));
    } catch (err) {
      setError((err as Error).message || "No se pudo leer el archivo.");
    } finally {
      setBusy(false);
    }
  }

  function onPaste() {
    setError(null);
    const r = importText(text);
    if (r.queued + r.listed + r.duplicates === 0 && r.findable === 0) {
      setError("No encontramos correos en el texto. Pega una tabla con encabezados o una lista de correos.");
      return;
    }
    setText("");
    finish(r);
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void onFile(file);
  }

  return (
    <div className="space-y-4">
      <div role="tablist" aria-label="Forma de importar" className="flex rounded-xl border border-white/10 bg-slate-950/50 p-1">
        {(
          [
            { id: "file", label: "Subir archivo", icon: FileSpreadsheet },
            { id: "paste", label: "Pegar lista", icon: ClipboardPaste },
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={mode === t.id}
            onClick={() => setMode(t.id)}
            className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold transition ${
              mode === t.id ? "bg-violet-500/20 text-white" : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <t.icon className="h-3.5 w-3.5" /> {t.label}
          </button>
        ))}
      </div>

      {mode === "file" ? (
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
            {busy ? <Spinner className="h-6 w-6" /> : <UploadCloud className="h-6 w-6" />}
          </span>
          <p className="mt-3 text-sm text-slate-300">{busy ? "Leyendo archivo…" : "Arrastra tu archivo aquí"}</p>
          <p className="mt-1 text-xs text-slate-500">
            Excel (.xlsx), CSV o TXT · hasta 15 MB · exportaciones de Google Maps, CRM, Apify u otras herramientas
          </p>
          <button type="button" disabled={busy} onClick={() => fileRef.current?.click()} className="btn btn-sm btn-primary mt-5">
            <FileUp className="h-3.5 w-3.5" /> Elegir archivo
          </button>
          <input
            ref={fileRef}
            type="file"
            accept={IMPORT_ACCEPT}
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void onFile(file);
              e.target.value = "";
            }}
          />
        </div>
      ) : (
        <div>
          <label htmlFor="import-paste" className="label">
            Pega una tabla copiada de Excel / Google Sheets o una lista de correos
          </label>
          <textarea
            id="import-paste"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={8}
            placeholder={"nombre\tempresa\tcorreo\nAna Pérez\tAcme SA\tana@acme.com\n\no simplemente:\nventas@empresa.com\nClínica Sonrisa <info@sonrisa.com>"}
            className="input resize-y font-mono text-xs"
          />
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <p className="text-[11px] text-slate-500">
              {preview ? `${previewEmails} correo${previewEmails === 1 ? "" : "s"} detectado${previewEmails === 1 ? "" : "s"}` : "Se aceptan columnas separadas por tabulador, coma o punto y coma."}
            </p>
            <button type="button" onClick={onPaste} disabled={!text.trim()} className="btn btn-sm btn-primary">
              <ClipboardPaste className="h-3.5 w-3.5" /> Importar contactos
            </button>
          </div>
        </div>
      )}

      <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] px-4 py-3 text-[11px] leading-relaxed text-slate-400">
        Detectamos solas las columnas <b className="text-slate-300">nombre, empresa, correo, teléfono, WhatsApp, web, ciudad y rubro</b> (en
        español o inglés). Si no hay encabezados, buscamos la columna que tiene correos. Los duplicados se omiten.{" "}
        <button type="button" onClick={downloadImportTemplate} className="text-violet-300 underline hover:text-violet-200">
          Descargar plantilla de ejemplo
        </button>
      </div>

      {error && <p className="text-xs text-rose-400">{error}</p>}

      {report && (
        <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/[0.07] px-4 py-3">
          <p className="text-xs text-emerald-200">{describeImport(report, target)}</p>
          {report.detected.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {report.detected.map((f) => (
                <span key={f} className="badge border-emerald-500/25 text-[10px] text-emerald-200">
                  {FIELD_LABELS[f]}
                </span>
              ))}
            </div>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            {target === "search" && report.queued > 0 && (
              <button
                type="button"
                onClick={() => {
                  setTab("sender");
                  onDone();
                }}
                className="btn btn-sm btn-primary"
              >
                Ir a la campaña
              </button>
            )}
            {target === "campaign" && report.findable > 0 && (
              <button
                type="button"
                onClick={() => {
                  setTab("search");
                  onDone();
                }}
                className="btn btn-sm btn-secondary"
              >
                <Search className="h-3.5 w-3.5" /> Buscar sus correos
              </button>
            )}
            <button type="button" onClick={onDone} className="btn btn-sm btn-ghost">
              Listo
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
