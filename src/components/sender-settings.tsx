"use client";

import { useId, useRef, useState } from "react";
import { isValidEmail } from "@/lib/sanitize";
import {
  MAILER_MODES,
  REPLY_TO_PLACEHOLDER,
  SENDER_EMAIL_PLACEHOLDER,
  SENDER_NAME_PLACEHOLDER,
  clearMailerSecrets,
  getMailerSnapshot,
  isMailerConfigured,
  mailerModeLabel,
  saveMailerConfig,
  type MailerConfig,
  type MailerMode,
} from "@/lib/mailer";

type Tone = "ok" | "error";

export function SenderSettings() {
  const [form, setForm] = useState<MailerConfig>(() => getMailerSnapshot());
  const [testing, setTesting] = useState(false);
  const busyRef = useRef(false);
  const [notice, setNotice] = useState<{ tone: Tone; text: string } | null>(null);

  const configured = isMailerConfigured(form);

  function patch<K extends keyof MailerConfig>(key: K, value: MailerConfig[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function onSave() {
    if (!form.senderEmail.trim() || !isValidEmail(form.senderEmail)) {
      setNotice({ tone: "error", text: "Ingresa un correo remitente válido." });
      return;
    }
    saveMailerConfig(form);
    setNotice({
      tone: "ok",
      text: `Configuración guardada. Modo activo: ${mailerModeLabel(form.mode)}.`,
    });
  }

  function onClear() {
    clearMailerSecrets();
    setForm(getMailerSnapshot());
    setNotice({ tone: "ok", text: "Credenciales y claves eliminadas del dispositivo." });
  }

  async function onTest() {
    if (busyRef.current) return;
    if (!isValidEmail(form.senderEmail)) {
      setNotice({ tone: "error", text: "Define un correo remitente válido antes de probar." });
      return;
    }
    busyRef.current = true;
    setTesting(true);
    setNotice(null);
    try {
      const res = await fetch("/api/send-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: form.senderEmail,
          mode: form.mode,
          senderName: form.senderName,
        }),
      });
      const data = await res.json();
      if (res.ok && data?.success === true) {
        setNotice({
          tone: "ok",
          text: `Correo de prueba enviado a ${form.senderEmail} vía ${mailerModeLabel(form.mode)}.`,
        });
      } else {
        setNotice({
          tone: "error",
          text: typeof data?.message === "string" ? data.message : "No se pudo enviar la prueba.",
        });
      }
    } catch {
      setNotice({ tone: "error", text: "Error de conexión al enviar el correo de prueba." });
    } finally {
      busyRef.current = false;
      setTesting(false);
    }
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 shadow-xl shadow-black/20 backdrop-blur-xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold text-slate-100">Configuración del Remitente</h3>
          <p className="mt-1 text-xs text-slate-500">
            Identidad y canal de envío. Las claves se guardan ofuscadas en este dispositivo.
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium ${
            configured ? "bg-emerald-500/15 text-emerald-400" : "bg-slate-800 text-slate-500"
          }`}
        >
          {configured ? "Listo" : "Sin configurar"}
        </span>
      </div>

      <div
        role="radiogroup"
        aria-label="Canal de envío"
        className="mt-4 grid grid-cols-2 gap-1 rounded-xl border border-white/10 bg-slate-950/40 p-1"
      >
        {MAILER_MODES.map((mode) => {
          const active = form.mode === mode.id;
          return (
            <button
              key={mode.id}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => patch("mode", mode.id as MailerMode)}
              className={`rounded-lg px-3 py-2 text-xs font-medium transition ${
                active
                  ? "bg-slate-700/70 text-white shadow-sm"
                  : "text-slate-400 hover:bg-white/5 hover:text-slate-200"
              }`}
            >
              {mode.label}
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-[11px] text-slate-500">
        {MAILER_MODES.find((m) => m.id === form.mode)?.hint}
      </p>

      <div className="mt-4 space-y-3">
        <Field
          label="Nombre del Remitente"
          value={form.senderName}
          onChange={(v) => patch("senderName", v)}
          placeholder={SENDER_NAME_PLACEHOLDER}
        />
        <Field
          label="Correo Remitente"
          type="email"
          value={form.senderEmail}
          onChange={(v) => patch("senderEmail", v)}
          placeholder={SENDER_EMAIL_PLACEHOLDER}
        />
        <Field
          label="Correo de Respuesta (Reply-To)"
          type="email"
          value={form.replyTo}
          onChange={(v) => patch("replyTo", v)}
          placeholder={REPLY_TO_PLACEHOLDER}
        />
      </div>

      <div className="mt-4 space-y-3 border-t border-white/10 pt-4">
        {form.mode === "smtp" && (
          <>
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <Field
                  label="Servidor SMTP"
                  value={form.smtpHost}
                  onChange={(v) => patch("smtpHost", v)}
                  placeholder="smtp.tudominio.com"
                />
              </div>
              <Field
                label="Puerto"
                value={form.smtpPort}
                onChange={(v) => patch("smtpPort", v)}
                placeholder="587"
              />
            </div>
            <Field
              label="Usuario SMTP"
              value={form.smtpUser}
              onChange={(v) => patch("smtpUser", v)}
              placeholder="usuario@tudominio.com"
            />
            <SecretField
              label="Contraseña SMTP"
              value={form.smtpPass}
              onChange={(v) => patch("smtpPass", v)}
              placeholder="••••••••••••"
            />
          </>
        )}

        {form.mode === "resend" && (
          <SecretField
            label="Resend API Key"
            value={form.resendKey}
            onChange={(v) => patch("resendKey", v)}
            placeholder="re_xxxxxxxxxxxxxxxxxxxxxxxx"
          />
        )}

        {form.mode === "sendgrid" && (
          <SecretField
            label="SendGrid API Key"
            value={form.sendgridKey}
            onChange={(v) => patch("sendgridKey", v)}
            placeholder="SG.xxxxxxxxxxxxxxxxxxxxxxxx"
          />
        )}

        {form.mode === "simulated" && (
          <p className="rounded-lg border border-white/10 bg-slate-900/50 p-3 text-[11px] text-slate-400">
            Modo demostración: el flujo de envío se simula sin conectar un proveedor real.
          </p>
        )}
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onSave}
          className="flex-1 rounded-xl bg-sky-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-sky-500/20 transition hover:bg-sky-400"
        >
          Guardar Remitente
        </button>
        <button
          type="button"
          onClick={onTest}
          disabled={testing}
          className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-2.5 text-sm font-semibold text-emerald-300 transition hover:bg-emerald-500/20 disabled:opacity-50"
        >
          {testing ? "Enviando…" : "Enviar Correo de Prueba"}
        </button>
        <button
          type="button"
          onClick={onClear}
          className="rounded-xl border border-white/10 px-4 py-2.5 text-sm font-medium text-slate-300 transition hover:bg-white/10"
        >
          Borrar
        </button>
      </div>

      {notice && (
        <p
          className={`mt-3 text-xs ${
            notice.tone === "ok" ? "text-emerald-400" : "text-rose-400"
          }`}
        >
          {notice.text}
        </p>
      )}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  type?: string;
}) {
  const id = useId();
  return (
    <div className="block">
      <label htmlFor={id} className="mb-1.5 block text-xs font-medium text-slate-400">
        {label}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete="off"
        spellCheck={false}
        className="w-full rounded-lg border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20"
      />
    </div>
  );
}

function SecretField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  const [visible, setVisible] = useState(false);
  const id = useId();
  return (
    <div className="block">
      <label htmlFor={id} className="mb-1.5 block text-xs font-medium text-slate-400">
        {label}
      </label>
      <div className="flex gap-2">
        <input
          id={id}
          type={visible ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete="off"
          spellCheck={false}
          className="w-full rounded-lg border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20"
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          className="shrink-0 rounded-lg border border-white/10 px-3 text-xs font-medium text-slate-400 transition hover:bg-white/10 hover:text-slate-200"
        >
          {visible ? "Ocultar" : "Ver"}
        </button>
      </div>
    </div>
  );
}
