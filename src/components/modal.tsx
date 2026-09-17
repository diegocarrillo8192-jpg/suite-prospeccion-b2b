"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}

/**
 * Accessible modal built on the native `<dialog>` element. Using the platform
 * primitive gives us focus management, focus trapping, Escape handling, the
 * top layer and an inert background for free.
 */
export function Modal({ open, onClose, title, description, children, className }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    dialog.setAttribute("closedby", "any");
    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      onCancel={onClose}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      className={`animate-pop-in m-auto max-h-[90vh] w-[calc(100%-2rem)] max-w-lg overflow-y-auto rounded-2xl border border-white/10 bg-slate-900/80 p-6 text-slate-100 shadow-xl shadow-black/50 backdrop-blur-xl ${
        className ?? ""
      }`}
    >
      <div className="flex items-start justify-between gap-4 border-b border-white/10 pb-4">
        <div>
          <h3 id={titleId} className="text-lg font-semibold text-slate-100">
            {title}
          </h3>
          {description && (
            <p id={descriptionId} className="mt-1 text-xs text-slate-400">
              {description}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar"
          className="rounded-lg px-2 py-1 text-sm text-slate-400 transition hover:bg-white/10 hover:text-slate-100"
        >
          ✕
        </button>
      </div>
      <div className="mt-5">{children}</div>
    </dialog>
  );
}
