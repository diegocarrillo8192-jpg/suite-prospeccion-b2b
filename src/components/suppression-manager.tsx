"use client";

import { useMemo, useState } from "react";
import { Ban, X } from "lucide-react";
import { useAppState } from "./app-state";
import { Modal } from "./modal";
import { EmptyState } from "./ui";

/** Gestión de la lista de bajas: correos a los que nunca se enviará. */
export function SuppressionManager({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { suppressed, addSuppressed, removeSuppressed, notify } = useAppState();
  const [draft, setDraft] = useState("");
  const [filter, setFilter] = useState("");

  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return q ? suppressed.filter((e) => e.includes(q)) : suppressed;
  }, [suppressed, filter]);

  function onAdd() {
    const emails = draft.split(/[\s,;]+/).filter(Boolean);
    const added = addSuppressed(emails);
    setDraft("");
    notify(
      added ? "success" : "info",
      added ? `${added} correo${added === 1 ? "" : "s"} añadido${added === 1 ? "" : "s"} a la lista de bajas` : "No había correos nuevos válidos"
    );
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Lista de bajas"
      description="Personas que pidieron no recibir más correos. Se excluyen automáticamente de todas las campañas."
      className="max-w-xl"
    >
      <label htmlFor="suppress-input" className="label">
        Añadir correos (uno por línea, coma o espacio)
      </label>
      <textarea
        id="suppress-input"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        rows={3}
        placeholder={"cliente@empresa.com\notro@dominio.com"}
        className="input resize-y font-mono text-xs"
      />
      <div className="mt-2 flex justify-end">
        <button type="button" onClick={onAdd} disabled={!draft.trim()} className="btn btn-sm btn-primary">
          <Ban className="h-3.5 w-3.5" /> Añadir a bajas
        </button>
      </div>

      <div className="mt-5 flex items-center justify-between gap-2">
        <p className="text-xs font-semibold text-slate-300">{suppressed.length} correos dados de baja</p>
        {suppressed.length > 8 && (
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Buscar…"
            aria-label="Buscar en la lista de bajas"
            className="input w-44 py-1.5 text-xs"
          />
        )}
      </div>
      {suppressed.length === 0 ? (
        <EmptyState icon={Ban} title="Nadie se ha dado de baja" description="Cuando alguien responda «BAJA», añádelo aquí." />
      ) : (
        <ul className="mt-3 max-h-64 space-y-1 overflow-y-auto pr-1">
          {visible.map((email) => (
            <li key={email} className="flex items-center justify-between gap-2 rounded-lg bg-white/[0.03] px-3 py-1.5 text-xs text-slate-300">
              <span className="truncate">{email}</span>
              <button
                type="button"
                onClick={() => removeSuppressed(email)}
                aria-label={`Quitar ${email} de la lista de bajas`}
                className="rounded p-1 text-slate-500 transition hover:bg-white/10 hover:text-slate-200"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
