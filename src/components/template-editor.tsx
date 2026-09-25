"use client";

import { useId, useState, useSyncExternalStore } from "react";
import { CHIPS, isHtmlTemplate, renderTemplate, senderExtras } from "@/lib/template";
import {
  getMailerSnapshot,
  getServerMailerSnapshot,
  subscribeMailer,
} from "@/lib/mailer";
import {
  EMAIL_TEMPLATES,
  applyFieldsToHtml,
  hasEditableFields,
  parseFields,
  type TemplateFields,
} from "@/lib/email-templates";
import type { Prospect } from "@/lib/types";

interface Props {
  subject: string;
  onSubject: (s: string) => void;
  body: string;
  onBody: (s: string) => void;
}

type Mode = "visual" | "code";

const DEFAULT_SENDER_NAME = "Nombre del Remitente";
const DEFAULT_SENDER_EMAIL = "correo@tudominio.com";

const SAMPLE: Prospect = {
  id: "sample",
  nombre: "Nombre Apellido",
  empresa: "Empresa de Ejemplo",
  correo: "contacto@empresa-ejemplo.com",
  telefono: "+00 000 000 0000",
  whatsapp: "00000000000",
  direccion: "Calle de Ejemplo 123",
  website: "https://empresa-ejemplo.com",
  ciudad: "Ciudad de Ejemplo",
  rubro: "Servicios",
};

export function TemplateEditor({ subject, onSubject, body, onBody }: Props) {
  const [mode, setMode] = useState<Mode>("visual");
  const [activeId, setActiveId] = useState<string>(EMAIL_TEMPLATES[0].id);
  const [fields, setFields] = useState<TemplateFields>(EMAIL_TEMPLATES[0].defaults);
  const mailer = useSyncExternalStore(
    subscribeMailer,
    getMailerSnapshot,
    getServerMailerSnapshot
  );

  const fromName = mailer.senderName.trim() || DEFAULT_SENDER_NAME;
  const fromEmail = mailer.senderEmail.trim() || DEFAULT_SENDER_EMAIL;
  const extras = senderExtras({
    senderName: mailer.senderName,
    senderEmail: mailer.senderEmail,
  });

  const editable = hasEditableFields(body);

  function applyTemplate(id: string) {
    const tpl = EMAIL_TEMPLATES.find((t) => t.id === id);
    if (!tpl) return;
    setActiveId(id);
    setFields(tpl.defaults);
    onSubject(tpl.subject);
    onBody(tpl.build(tpl.defaults));
    setMode("visual");
  }

  function updateField(key: keyof TemplateFields, value: string) {
    const next = { ...fields, [key]: value };
    setFields(next);
    onBody(applyFieldsToHtml(body, next));
  }

  function switchMode(next: Mode) {
    if (next === mode) return;
    if (next === "visual" && editable) {
      const parsed = parseFields(body);
      setFields(parsed);
      onBody(applyFieldsToHtml(body, parsed));
    }
    setMode(next);
  }

  function insertToken(token: string) {
    const el = document.activeElement;
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
      const key = el.dataset.field as keyof TemplateFields | undefined;
      if (key && key in fields) {
        const start = el.selectionStart ?? el.value.length;
        const end = el.selectionEnd ?? el.value.length;
        const next = el.value.slice(0, start) + token + el.value.slice(end);
        updateField(key, next);
        requestAnimationFrame(() => {
          el.focus();
          el.selectionStart = el.selectionEnd = start + token.length;
        });
        return;
      }
    }
    updateField("mensaje", fields.mensaje + token);
  }

  const previewHtml = isHtmlTemplate(body);

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 shadow-xl shadow-black/20 backdrop-blur-xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-slate-100">Plantilla / Editor de Mensaje</h3>
        <div
          role="tablist"
          aria-label="Modo de edición"
          className="flex gap-1 rounded-xl border border-white/10 bg-slate-950/40 p-1"
        >
          <ModeTab active={mode === "visual"} onClick={() => switchMode("visual")}>
            Editor Visual
          </ModeTab>
          <ModeTab active={mode === "code"} onClick={() => switchMode("code")}>
            Código HTML
          </ModeTab>
        </div>
      </div>

      <div className="mt-4">
        <p className="mb-2 text-xs font-medium text-slate-400">Plantillas prediseñadas</p>
        <div className="grid gap-2 sm:grid-cols-3">
          {EMAIL_TEMPLATES.map((tpl) => {
            const active = activeId === tpl.id;
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

      {mode === "visual" ? (
        <div className="mt-5 space-y-4">
          {!editable && (
            <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-[11px] text-amber-300">
              El contenido actual no usa campos editables. Elige una plantilla prediseñada
              o edita el HTML en la pestaña «Código HTML».
            </p>
          )}

          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-[11px] text-slate-500">Insertar variable:</span>
            {CHIPS.map((c) => (
              <button
                key={c.token}
                type="button"
                onClick={() => insertToken(c.token)}
                className="rounded-md border border-white/10 bg-white/[0.04] px-2 py-1 text-[11px] font-medium text-sky-300 transition hover:bg-white/10"
              >
                + {c.label}
              </button>
            ))}
          </div>

          <Field
            label="Saludo / Encabezado"
            fieldKey="saludo"
            value={fields.saludo}
            onChange={updateField}
          />

          <Field
            label="Mensaje Principal"
            fieldKey="mensaje"
            value={fields.mensaje}
            onChange={updateField}
            multiline
            rows={6}
          />

          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              label="Texto del Botón (CTA)"
              fieldKey="ctaTexto"
              value={fields.ctaTexto}
              onChange={updateField}
            />
            <Field
              label="Enlace del Botón (CTA)"
              fieldKey="ctaEnlace"
              value={fields.ctaEnlace}
              onChange={updateField}
              type="url"
            />
          </div>

          <Field
            label="Firma Personalizada"
            fieldKey="firma"
            value={fields.firma}
            onChange={updateField}
            multiline
            rows={3}
          />
        </div>
      ) : (
        <div className="mt-5">
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <label htmlFor="tpl-body" className="text-xs font-medium text-slate-400">
              Código HTML
            </label>
            <span className="text-[11px] text-slate-600">Modo avanzado</span>
          </div>
          <textarea
            id="tpl-body"
            value={body}
            onChange={(e) => onBody(e.target.value)}
            rows={14}
            spellCheck={false}
            className="w-full resize-y rounded-xl border border-white/10 bg-slate-900/60 px-3.5 py-2.5 font-mono text-xs text-slate-100 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
          />
        </div>
      )}

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

function ModeTab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
        active
          ? "bg-slate-700/70 text-white shadow-sm"
          : "text-slate-400 hover:bg-white/5 hover:text-slate-200"
      }`}
    >
      {children}
    </button>
  );
}

function Field({
  label,
  fieldKey,
  value,
  onChange,
  multiline,
  rows = 3,
  type = "text",
}: {
  label: string;
  fieldKey: keyof TemplateFields;
  value: string;
  onChange: (key: keyof TemplateFields, value: string) => void;
  multiline?: boolean;
  rows?: number;
  type?: string;
}) {
  const id = useId();
  const classes =
    "w-full rounded-xl border border-white/10 bg-slate-900/60 px-3.5 py-2.5 text-sm text-slate-100 placeholder:text-slate-600 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20";
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-xs font-medium text-slate-400">
        {label}
      </label>
      {multiline ? (
        <textarea
          id={id}
          data-field={fieldKey}
          value={value}
          onChange={(e) => onChange(fieldKey, e.target.value)}
          rows={rows}
          className={`${classes} resize-y`}
        />
      ) : (
        <input
          id={id}
          data-field={fieldKey}
          type={type}
          value={value}
          onChange={(e) => onChange(fieldKey, e.target.value)}
          autoComplete="off"
          spellCheck={false}
          className={classes}
        />
      )}
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
