"use client";

import { useId, useState, useSyncExternalStore } from "react";
import { Code2, Monitor, PenLine, Smartphone } from "lucide-react";
import { CHIPS, isHtmlTemplate, renderTemplate, resolvePlaceholderLinks, senderExtras } from "@/lib/template";
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
import { sanitizeHtml } from "@/lib/sanitize";
import type { Prospect } from "@/lib/types";

interface Props {
  subject: string;
  onSubject: (s: string) => void;
  body: string;
  onBody: (s: string) => void;
  templateId?: string;
  onTemplateId?: (id: string) => void;
  /** Destinatario real para la vista previa; si no hay, se usa un ejemplo. */
  sample?: Prospect;
  /** El asunto se edita fuera (constructor de campaña). */
  hideSubject?: boolean;
  /** Texto de vista previa (preheader) mostrado en la cabecera de la vista previa. */
  preheader?: string;
  /** Sin tarjeta ni título: se integra dentro de otra sección. */
  bare?: boolean;
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

export function TemplateEditor({
  subject,
  onSubject,
  body,
  onBody,
  templateId,
  onTemplateId,
  sample,
  hideSubject,
  preheader,
  bare,
}: Props) {
  const [mode, setMode] = useState<Mode>(() => (hasEditableFields(body) ? "visual" : "code"));
  const [activeId, setActiveIdState] = useState<string>(templateId ?? EMAIL_TEMPLATES[0].id);
  const [fields, setFields] = useState<TemplateFields>(() =>
    hasEditableFields(body) ? parseFields(body) : EMAIL_TEMPLATES[0].defaults
  );
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const previewTarget = sample ?? SAMPLE;

  function setActiveId(id: string) {
    setActiveIdState(id);
    onTemplateId?.(id);
  }
  const mailer = useSyncExternalStore(
    subscribeMailer,
    getMailerSnapshot,
    getServerMailerSnapshot
  );

  const fromName = mailer.senderName.trim() || DEFAULT_SENDER_NAME;
  const fromEmail = mailer.senderEmail.trim() || DEFAULT_SENDER_EMAIL;
  const extras = senderExtras(
    {
      senderName: mailer.senderName,
      senderEmail: mailer.senderEmail,
      senderPhone: mailer.senderPhone,
      logoUrl: mailer.logoUrl,
    },
    { preview: true }
  );

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
    <div className={bare ? "" : "card card-pad"}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          {!bare && (
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-500/15 text-violet-300">
              <PenLine className="h-4 w-4" />
            </span>
          )}
          <h3 className={bare ? "text-xs font-medium text-slate-400" : "text-sm font-semibold text-white"}>
            {bare ? "Modo de edición" : "Plantilla / Editor de Mensaje"}
          </h3>
        </div>
        <div
          role="tablist"
          aria-label="Modo de edición"
          className="flex gap-1 rounded-xl border border-white/10 bg-slate-950/40 p-1"
        >
          <ModeTab active={mode === "visual"} onClick={() => switchMode("visual")}>
            Editor Visual
          </ModeTab>
          <ModeTab active={mode === "code"} onClick={() => switchMode("code")}>
            <Code2 className="h-3.5 w-3.5" aria-hidden="true" />
            Código HTML
          </ModeTab>
        </div>
      </div>

      <div className="mt-4">
        <p className="mb-2 text-xs font-medium text-slate-400">Plantillas prediseñadas</p>
        <div className="grid gap-2 sm:grid-cols-2 2xl:grid-cols-4">
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
                    ? "border-violet-400/50 bg-violet-500/10 ring-1 ring-violet-400/20"
                    : "border-white/[0.07] bg-white/[0.015] hover:border-white/20 hover:bg-white/[0.04]"
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

      {!hideSubject && (
        <div className="mt-5">
          <label htmlFor="tpl-subject" className="mb-1.5 block text-xs font-medium text-slate-400">
            Asunto
          </label>
          <input id="tpl-subject" value={subject} onChange={(e) => onSubject(e.target.value)} className="input" />
        </div>
      )}

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
                className="rounded-md border border-violet-400/20 bg-violet-500/10 px-2 py-1 text-[11px] font-medium text-violet-200 transition hover:bg-violet-500/20"
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
            className="input resize-y font-mono text-xs leading-relaxed"
          />
        </div>
      )}

      <div className="mt-6">
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="text-xs font-medium text-slate-400">
            Vista previa{sample ? ` · ${sample.empresa}` : " · datos de ejemplo"}
          </p>
          <div className="flex gap-1 rounded-lg border border-white/10 bg-slate-950/40 p-0.5" role="group" aria-label="Dispositivo de vista previa">
            <button
              type="button"
              onClick={() => setDevice("desktop")}
              aria-pressed={device === "desktop"}
              aria-label="Vista escritorio"
              className={`rounded-md p-1.5 transition ${device === "desktop" ? "bg-white/10 text-white" : "text-slate-500 hover:text-slate-300"}`}
            >
              <Monitor className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setDevice("mobile")}
              aria-pressed={device === "mobile"}
              aria-label="Vista móvil"
              className={`rounded-md p-1.5 transition ${device === "mobile" ? "bg-white/10 text-white" : "text-slate-500 hover:text-slate-300"}`}
            >
              <Smartphone className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
        <div className="overflow-hidden rounded-2xl border border-white/10 bg-slate-950/40">
          <div className="space-y-1.5 border-b border-white/10 bg-white/[0.03] px-4 py-3 text-xs">
            <PreviewRow label="De" value={`${fromName} <${fromEmail}>`} />
            <PreviewRow label="Para" value={previewTarget.correo} />
            <PreviewRow label="Asunto" value={renderTemplate(subject, previewTarget, extras)} strong />
            {preheader?.trim() && <PreviewRow label="Preview" value={renderTemplate(preheader, previewTarget, extras)} />}
          </div>
          <div className={`mx-auto transition-[max-width] duration-300 ${device === "mobile" ? "max-w-[380px]" : "max-w-full"}`}>
            {previewHtml ? (
              <div
                className="bg-white"
                dangerouslySetInnerHTML={{
                  __html: sanitizeHtml(resolvePlaceholderLinks(renderTemplate(body, previewTarget, extras), mailer)),
                }}
              />
            ) : (
              <div className="whitespace-pre-wrap px-4 py-4 text-sm text-slate-300">
                {renderTemplate(body, previewTarget, extras)}
              </div>
            )}
          </div>
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
      className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition ${
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
  const classes = "input";
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
