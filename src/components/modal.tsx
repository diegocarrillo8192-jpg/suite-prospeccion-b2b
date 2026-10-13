"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
  /** Impide cerrar con Escape o clic fuera (p. ej. durante un envío). */
  locked?: boolean;
}

/**
 * Modal accesible sobre el elemento nativo `<dialog>`: gestión de foco, capa
 * superior y fondo inerte de serie. El contenido solo se monta mientras está
 * abierto, así los formularios internos leen siempre la configuración vigente.
 */
export function Modal({ open, onClose, title, description, children, className, locked }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    dialog.setAttribute("closedby", locked ? "none" : "any");
    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
  }, [open, locked]);

  return (
    <dialog
      ref={dialogRef}
      onClose={() => {
        if (open) onClose();
      }}
      onCancel={(e) => {
        e.preventDefault();
        if (!locked) onClose();
      }}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      className={`animate-pop-in m-auto max-h-[90vh] w-[calc(100%-2rem)] ${
        className?.includes("max-w-") ? "" : "max-w-lg"
      } overflow-y-auto rounded-3xl border border-white/10 bg-[#0b0f1a]/95 p-0 text-slate-100 shadow-2xl shadow-black/60 backdrop-blur-2xl ${
        className ?? ""
      }`}
    >
      {open && (
        <>
          <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-white/[0.07] bg-[#0b0f1a]/90 px-6 py-5 backdrop-blur-xl">
            <div>
              <h2 id={titleId} className="text-lg font-semibold tracking-tight text-white">
                {title}
              </h2>
              {description && (
                <p id={descriptionId} className="mt-1 text-xs text-slate-400">
                  {description}
                </p>
              )}
            </div>
            {!locked && (
              <button
                type="button"
                onClick={onClose}
                aria-label="Cerrar"
                className="rounded-lg p-1.5 text-slate-400 transition hover:bg-white/10 hover:text-slate-100"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <div className="px-6 py-5">{children}</div>
        </>
      )}
    </dialog>
  );
}
