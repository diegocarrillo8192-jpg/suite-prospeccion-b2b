"use client";

import { useRef, useState, useSyncExternalStore } from "react";
import { CHIPS, isHtmlTemplate, renderTemplate, senderExtras } from "@/lib/template";
import {
  getMailerSnapshot,
  getServerMailerSnapshot,
  subscribeMailer,
} from "@/lib/mailer";
import { EMAIL_TEMPLATES } from "@/lib/email-templates";
import type { Prospect } from "@/lib/types";

interface Props {
  subject: string;
  onSubject: (s: string) => void;
  body: string;
  onBody: (s: string) => void;
}

const DEFAULT_SENDER_NAME = "Nombre de Remitente";
const DEFAULT_SENDER_EMAIL = "correo@tudominio.com";

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
  const [activeTemplate, setActiveTemplate] = useState<string | null>(null);
  const mailer = useSyncExternalStore(
    subscribeMailer,
    getMailerSnapshot,
    getServerMailerSnapshot
  );

  const fromName = mailer.senderName.trim() || DEFAULT_SENDER_NAME;
  const fromEmail = mailer.senderEmail.trim() || DEFAULT_SENDER_EMAIL;
  const extras = senderExtras({
    senderName: mailer.senderName || fromName,
    senderEmail: mailer.senderEmail || fromEmail,
  });

  function applyTemplate(id: string) {
    const tpl = EMAIL_TEMPLATES.find((t) => t.id === id);
    if (!tpl) return;
    setActiveTemplate(id);
    onSubject(tpl.subject);
    onBody(tpl.html);
  }

  function insertChip(token: string, target: "subject" | "body") {
    if (target === "subject") {
      onSubject(subject + token);
      return;
    }
    const el = bodyRef.current;
    if (el) {
      const start = el.selectionStart ?? body.length;
      const end = el.selectionEnd ?? body.length;
      const next = body.slice(0, start) + token + body.slice(end);
      onBody(next);
      requestAnimationFrame(() => {
        el.focus();
        el.selectionStart = el.selectionEnd = start + token.length;
      });
    } else {
      onBody(body + token);
    }
  }

  const previewHtml = isHtmlTemplate(body);

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 shadow-xl shadow-black/20 backdrop-blur-xl">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-100">Plantilla / Editor de Mensaje</h3>
        {activeTemplate && (
          <span className="text-[11px] text-slate-500">
            {EMAIL_TEMPLATES.find((t) => t.id === activeTemplate)?.name}
          </span>
        )}
      </div>

      <div className="mt-4">
        <p className="mb-2 text-xs font-medium text-slate-400">Plantillas prediseñadas</p>
        <div className="grid gap-2 sm:grid-cols-3">
          {EMAIL_TEMPLATES.map((tpl) => {
            const active = activeTemplate === tpl.id;
            return (
              <button
                key={tpl.id}
                type="button"
                onClick={() => applyTemplate(tpl.id)}
                aria-pressed={active}
                className={`rounded-xl border p-3 text-left transition ${
                  active
                    ? "border-emerald-500/60 bg-emerald-500/10"
                    : "border-white/10 bg-slate-900/40 hover:border-white/20 hover:bg-white/5"
                }`}
              >
                <span className="mb-2 flex items-center gap-2">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: tpl.accent }}
                  />
                  <span className="text-xs font-semibold text-slate-100">{tpl.name}</span>
                </span>
                <span className="block text-[11px] leading-snug text-slate-500">
                  {tpl.description}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-5">
        <label htmlFor="tpl-subject" className="mb-1.5 block text-xs font-medium text-slate-400">
          Asunto
        </label>
        <input
          id="tpl-subject"
          value={subject}
          onChange={(e) => onSubject(e.target.value)}
          className="w-full rounded-xl border border-white/10 bg-slate-900/60 px-3.5 py-2.5 text-sm text-slate-100 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
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
                key={c.token}
                type="button"
                onClick={() => insertChip(c.token, "body")}
                className="rounded-md border border-white/10 bg-white/[0.04] px-2 py-1 text-[11px] font-medium text-sky-300 transition hover:bg-white/10"
              >
                + {c.label}
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
          spellCheck={false}
          className="w-full resize-y rounded-xl border border-white/10 bg-slate-900/60 px-3.5 py-2.5 font-mono text-xs text-slate-100 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
        />
      </div>

      <div className="mt-4">
        <p className="mb-1.5 text-xs font-medium text-slate-400">Vista previa</p>
        <div className="overflow-hidden rounded-xl border border-white/10 bg-slate-900/50 shadow-xl shadow-black/20 backdrop-blur-xl">
          <div className="space-y-1.5 border-b border-white/10 bg-white/[0.03] px-4 py-3 text-xs">
            <PreviewRow label="De" value={`${fromName} <${fromEmail}>`} />
            <PreviewRow label="Para" value={SAMPLE.correo} />
            <PreviewRow label="Asunto" value={renderTemplate(subject, SAMPLE, extras)} strong />
          </div>
          {previewHtml ? (
            <div
              className="bg-white"
              dangerouslySetInnerHTML={{ __html: renderTemplate(body, SAMPLE, extras) }}
            />
          ) : (
            <div className="whitespace-pre-wrap px-4 py-4 text-sm text-slate-300">
              {renderTemplate(body, SAMPLE, extras)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function PreviewRow({
  label,
  value,
  strong,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className="flex items-start gap-2">
      <span className="w-14 shrink-0 text-slate-500">{label}:</span>
      <span
        className={`min-w-0 break-words ${
          strong ? "font-medium text-slate-100" : "text-slate-300"
        }`}
      >
        {value}
      </span>
    </div>
  );
}
