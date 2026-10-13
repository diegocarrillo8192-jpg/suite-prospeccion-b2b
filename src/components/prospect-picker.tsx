"use client";

import { useMemo, useState } from "react";
import { CheckSquare, Search, Square, Trash2, UserPlus } from "lucide-react";
import { useAppState } from "./app-state";
import { Modal } from "./modal";
import { EmptyState } from "./ui";
import type { Prospect } from "@/lib/types";

const MAX_ROWS = 400;

const emailOf = (p: Pick<Prospect, "correo">) => (p.correo ?? "").trim().toLowerCase();

function formatDate(ms?: number): string {
  if (!ms) return "";
  return new Date(ms).toLocaleDateString("es", { day: "2-digit", month: "short" });
}

/**
 * Selector de contactos encontrados en el Buscador: el usuario elige con
 * casillas a quién enviar, sin exportar ni volver a importar archivos.
 */
export function ProspectPicker({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Cargar contactos del Buscador"
      description="Todos los contactos con correo de tus búsquedas. Marca los que quieres incluir en esta campaña."
      className="max-w-3xl"
    >
      <PickerBody onDone={onClose} />
    </Modal>
  );
}

function PickerBody({ onDone }: { onDone: () => void }) {
  const { library, recipients, addRecipients, contactedEmails, suppressedSet, removeFromLibrary, setTab, notify } =
    useAppState();
  const [query, setQuery] = useState("");
  const [rubro, setRubro] = useState("");
  const [ciudad, setCiudad] = useState("");
  const [hideContacted, setHideContacted] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());

  const inList = useMemo(() => new Set(recipients.map(emailOf)), [recipients]);

  const rubros = useMemo(
    () => [...new Set(library.map((p) => p.rubro.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, "es")),
    [library]
  );
  const ciudades = useMemo(
    () => [...new Set(library.map((p) => p.ciudad.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, "es")),
    [library]
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return library.filter((p) => {
      const email = emailOf(p);
      if (suppressedSet.has(email)) return false;
      if (hideContacted && contactedEmails.has(email)) return false;
      if (rubro && p.rubro.trim() !== rubro) return false;
      if (ciudad && p.ciudad.trim() !== ciudad) return false;
      if (q && !`${p.empresa} ${p.nombre} ${p.correo} ${p.rubro} ${p.ciudad}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [library, query, rubro, ciudad, hideContacted, contactedEmails, suppressedSet]);

  const selectable = visible.filter((p) => !inList.has(emailOf(p)));
  const allSelected = selectable.length > 0 && selectable.every((p) => selected.has(emailOf(p)));
  const chosen = library.filter((p) => selected.has(emailOf(p)) && !inList.has(emailOf(p)));

  function toggle(p: Prospect) {
    const key = emailOf(p);
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleAll() {
    setSelected((s) => {
      const next = new Set(s);
      if (allSelected) selectable.forEach((p) => next.delete(emailOf(p)));
      else selectable.forEach((p) => next.add(emailOf(p)));
      return next;
    });
  }

  function addChosen() {
    const added = addRecipients(chosen);
    notify("success", `${added} contacto${added === 1 ? "" : "s"} añadido${added === 1 ? "" : "s"} a la campaña`);
    setSelected(new Set());
    onDone();
  }

  function forgetChosen() {
    const emails = [...selected];
    if (!window.confirm(`¿Quitar ${emails.length} contacto(s) de la biblioteca? No afecta a la campaña actual.`)) return;
    removeFromLibrary(emails);
    setSelected(new Set());
  }

  if (library.length === 0) {
    return (
      <EmptyState
        icon={Search}
        title="Aún no hay contactos scrapeados"
        description="Haz una búsqueda en el Buscador: los negocios con correo aparecerán aquí listos para elegir."
        action={
          <button
            type="button"
            onClick={() => {
              setTab("search");
              onDone();
            }}
            className="btn btn-sm btn-primary"
          >
            <Search className="h-3.5 w-3.5" /> Ir al Buscador
          </button>
        }
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar empresa, correo, rubro…"
            aria-label="Buscar contactos"
            className="input py-2 pl-9 text-xs"
          />
        </div>
        <select value={rubro} onChange={(e) => setRubro(e.target.value)} aria-label="Filtrar por rubro" className="input w-auto py-2 text-xs">
          <option value="">Todos los rubros</option>
          {rubros.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        <select value={ciudad} onChange={(e) => setCiudad(e.target.value)} aria-label="Filtrar por ciudad" className="input w-auto py-2 text-xs">
          <option value="">Todas las ciudades</option>
          {ciudades.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <button type="button" onClick={toggleAll} disabled={selectable.length === 0} className="btn btn-sm btn-secondary">
          {allSelected ? <CheckSquare className="h-3.5 w-3.5" /> : <Square className="h-3.5 w-3.5" />}
          {allSelected ? "Quitar selección" : `Seleccionar todos (${selectable.length})`}
        </button>
        <label className="flex cursor-pointer items-center gap-2 text-slate-400">
          <input
            type="checkbox"
            className="checkbox"
            checked={hideContacted}
            onChange={(e) => setHideContacted(e.target.checked)}
          />
          Ocultar ya contactados
        </label>
      </div>

      {visible.length === 0 ? (
        <p className="rounded-xl border border-white/[0.07] px-4 py-8 text-center text-xs text-slate-500">
          Ningún contacto coincide con los filtros.
        </p>
      ) : (
        <ul className="max-h-[46vh] space-y-1.5 overflow-y-auto pr-1">
          {visible.slice(0, MAX_ROWS).map((p) => {
            const key = emailOf(p);
            const already = inList.has(key);
            const checked = already || selected.has(key);
            return (
              <li key={key}>
                <label
                  className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 transition ${
                    already
                      ? "cursor-default border-emerald-500/20 bg-emerald-500/[0.05]"
                      : checked
                        ? "cursor-pointer border-violet-400/40 bg-violet-500/10"
                        : "cursor-pointer border-white/[0.06] bg-white/[0.02] hover:border-white/15"
                  }`}
                >
                  <input
                    type="checkbox"
                    className="checkbox"
                    checked={checked}
                    disabled={already}
                    onChange={() => toggle(p)}
                    aria-label={`Seleccionar ${p.empresa}`}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-slate-100">{p.empresa}</span>
                    <span className="block truncate text-xs text-slate-500">
                      {p.correo}
                      {p.rubro ? ` · ${p.rubro}` : ""}
                      {p.ciudad ? ` · ${p.ciudad}` : ""}
                    </span>
                  </span>
                  <span className="hidden shrink-0 flex-col items-end gap-1 sm:flex">
                    {already ? (
                      <span className="badge border-emerald-500/30 text-[10px] text-emerald-300">En la lista</span>
                    ) : p.emailStatus === "valid" ? (
                      <span className="badge border-teal-500/30 text-[10px] text-teal-300">Validado</span>
                    ) : null}
                    {contactedEmails.has(key) && (
                      <span className="badge border-violet-500/30 text-[10px] text-violet-300">Ya contactado</span>
                    )}
                    {p.foundAt ? <span className="text-[10px] text-slate-600">{formatDate(p.foundAt)}</span> : null}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      )}
      {visible.length > MAX_ROWS && (
        <p className="text-[11px] text-slate-500">
          Mostrando {MAX_ROWS} de {visible.length}. Usa los filtros para acotar; «Seleccionar todos» incluye todos los filtrados.
        </p>
      )}

      <div className="flex flex-col-reverse gap-2 border-t border-white/[0.07] pt-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <p className="text-xs text-slate-400">
            {library.length} en la biblioteca · <b className="text-white">{chosen.length}</b> seleccionados
          </p>
          {selected.size > 0 && (
            <button type="button" onClick={forgetChosen} className="btn btn-sm btn-ghost" title="Quitar de la biblioteca">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <button type="button" onClick={addChosen} disabled={chosen.length === 0} className="btn btn-primary">
          <UserPlus className="h-4 w-4" /> Añadir {chosen.length || ""} a la campaña
        </button>
      </div>
    </div>
  );
}
