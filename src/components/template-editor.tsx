"use client";

import { useRef } from "react";
import { CHIPS, renderTemplate } from "@/lib/template";
import type { Prospect } from "@/lib/types";

interface Props {
  subject: string;
  onSubject: (s: string) => void;
  body: string;
  onBody: (s: string) => void;
}

const SAMPLE: Prospect = {
  id: "sample",
  nombre: "María González",
  empresa: "Lumen Digital",
  correo: "contacto@lumendigital.com",
  telefono: "+54 11 5555-1234",
  whatsapp: "5491155551234",
  direccion: "Av. Corrientes 1234, Buenos Aires",
  website: "https://www.lumendigital.com",
  ciudad: "Buenos Aires",
  rubro: "Software",
};

export function TemplateEditor({ subject, onSubject, body, onBody }: Props) {
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  function insertChip(chip: string, target: "subject" | "body") {
    if (target === "subject") {
      onSubject(subject + chip);
      return;
    }
    const el = bodyRef.current;
    if (el) {
      const start = el.selectionStart ?? body.length;
      const end = el.selectionEnd ?? body.length;
      const next = body.slice(0, start) + chip + body.slice(end);
      onBody(next);
      requestAnimationFrame(() => {
        el.focus();
        el.selectionStart = el.selectionEnd = start + chip.length;
      });
    } else {
      onBody(body + chip);
    }
  }

  return (
    <div className="rounded-2xl border border-slate-800 bg-[#0f172a] p-6">
      <h3 className="text-sm font-semibold text-slate-100">Editor de Plantilla</h3>

      <div className="mt-4">
        <label htmlFor="tpl-subject" className="mb-1.5 block text-xs font-medium text-slate-400">
          Asunto
        </label>
        <input
          id="tpl-subject"
          value={subject}
          onChange={(e) => onSubject(e.target.value)}
          className="w-full rounded-xl border border-slate-700 bg-slate-900/60 px-3.5 py-2.5 text-sm text-slate-100 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
        />
      </div>

      <div className="mt-4">
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <label htmlFor="tpl-body" className="text-xs font-medium text-slate-400">
            Cuerpo (HTML / Texto)
          </label>
          <div className="flex flex-wrap gap-1.5">
            {CHIPS.map((c) => (
              <button
                key={c.key}
                type="button"
                onClick={() => insertChip(c.label, "body")}
                className="rounded-md bg-slate-800 px-2 py-1 font-mono text-[11px] text-sky-300 transition hover:bg-slate-700"
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>
        <textarea
          ref={bodyRef}
          id="tpl-body"
          value={body}
          onChange={(e) => onBody(e.target.value)}
          rows={9}
          className="w-full resize-y rounded-xl border border-slate-700 bg-slate-900/60 px-3.5 py-2.5 text-sm text-slate-100 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
        />
      </div>

      <div className="mt-4">
        <p className="mb-1.5 text-xs font-medium text-slate-400">Vista previa</p>
        <div className="whitespace-pre-wrap rounded-xl border border-slate-800 bg-slate-900/40 p-4 text-sm text-slate-300">
          <p className="font-medium text-slate-100">Asunto: {renderTemplate(subject, SAMPLE)}</p>
          <p className="mt-2">{renderTemplate(body, SAMPLE)}</p>
        </div>
      </div>
    </div>
  );
}
