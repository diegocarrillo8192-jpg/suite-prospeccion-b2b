"use client";

import { useId, useRef, useState } from "react";
import {
  CheckCircle2,
  Cloud,
  Eye,
  EyeOff,
  FlaskConical,
  Mail,
  PlugZap,
  Send,
  Server,
  ShieldCheck,
  UserRound,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { isValidEmail } from "@/lib/sanitize";
import { LogoField } from "./logo-field";
import { Spinner } from "./ui";
import {
  MAILER_MODES,
  REPLY_TO_PLACEHOLDER,
  SENDER_EMAIL_PLACEHOLDER,
  SENDER_NAME_PLACEHOLDER,
  clearMailerSecrets,
  getMailerSnapshot,
  isMailerConfigured,
  mailerModeLabel,
  providerConfigFrom,
  saveMailerConfig,
  type MailerConfig,
  type MailerMode,
} from "@/lib/mailer";

type Tone = "ok" | "error";
type Notice = { tone: Tone; text: string } | null;

const MODE_META: Record<MailerMode, { icon: LucideIcon; blurb: string }> = {
  gmail: { icon: Mail, blurb: "Cuenta de Gmail o Workspace" },
  smtp: { icon: Server, blurb: "Outlook, Zoho, Hostinger, cPanel…" },
  resend: { icon: Send, blurb: "API moderna, dominio propio" },
  sendgrid: { icon: Cloud, blurb: "Alto volumen (Twilio)" },
  simulated: { icon: FlaskConical, blurb: "Prueba sin enviar nada" },
};

const SMTP_PRESETS: { label: string; host: string; port: string }[] = [
  { label: "Outlook / Microsoft 365", host: "smtp.office365.com", port: "587" },
  { label: "Zoho Mail", host: "smtp.zoho.com", port: "465" },
  { label: "Hostinger", host: "smtp.hostinger.com", port: "465" },
  { label: "Yahoo", host: "smtp.mail.yahoo.com", port: "465" },
  { label: "GoDaddy", host: "smtpout.secureserver.net", port: "465" },
  { label: "iCloud", host: "smtp.mail.me.com", port: "587" },
];

const MODE_STEPS: Partial<Record<MailerMode, string[]>> = {
  gmail: [
    "Activa la verificación en dos pasos en tu cuenta de Google.",
    "Abre myaccount.google.com/apppasswords y crea una contraseña de aplicación.",
    "Pega aquí los 16 caracteres (con o sin espacios).",
  ],
  smtp: [
    "Elige tu proveedor en los accesos rápidos o escribe el servidor.",
    "Puerto 465 usa SSL; 587 usa STARTTLS.",
    "Usuario y contraseña suelen ser tu correo y su clave.",
  ],
  resend: [
    "Crea una cuenta en resend.com y verifica tu dominio (DNS).",
    "En API Keys crea una clave con permiso de envío.",
    "El correo remitente debe pertenecer al dominio verificado.",
  ],
  sendgrid: [
    "En SendGrid verifica un remitente o tu dominio (Sender Authentication).",
    "Crea una API Key con permiso «Mail Send».",
    "Usa como remitente el correo verificado.",
  ],
};

export function SenderSettings() {
  const [form, setForm] = useState<MailerConfig>(() => getMailerSnapshot());
  const [testing, setTesting] = useState(false);
  const [checking, setChecking] = useState(false);
  const busyRef = useRef(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [connection, setConnection] = useState<Notice>(null);

  const configured = isMailerConfigured(form);
  const steps = MODE_STEPS[form.mode];

  function patch<K extends keyof MailerConfig>(key: K, value: MailerConfig[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function onSave() {
    if (!form.senderEmail.trim() || !isValidEmail(form.senderEmail)) {
      setNotice({ tone: "error", text: "Ingresa un correo remitente válido." });
      return;
    }
    if (form.replyTo.trim() && !isValidEmail(form.replyTo)) {
      setNotice({ tone: "error", text: "El correo de respuesta (Reply-To) no es válido." });
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
    setConnection(null);
    setNotice({ tone: "ok", text: "Credenciales y claves eliminadas del dispositivo." });
  }

  async function onTestConnection() {
    if (busyRef.current) return;
    if (form.mode !== "simulated" && !isValidEmail(form.senderEmail)) {
      setConnection({ tone: "error", text: "Define un correo remitente válido antes de probar." });
      return;
    }
    busyRef.current = true;
    setChecking(true);
    setConnection(null);
    try {
      const res = await fetch("/api/test-connection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(providerConfigFrom(form)),
      });
      const data = await res.json();
      setConnection({
        tone: res.ok && data?.success === true ? "ok" : "error",
        text:
          typeof data?.message === "string"
            ? data.message
            : res.ok
              ? "Conexión verificada."
              : "No se pudo verificar la conexión.",
      });
    } catch {
      setConnection({ tone: "error", text: "Error de conexión al probar las credenciales." });
    } finally {
      busyRef.current = false;
      setChecking(false);
    }
  }

  async function onTestEmail() {
    if (busyRef.current) return;
    if (!isValidEmail(form.senderEmail)) {
      setNotice({ tone: "error", text: "Define un correo remitente válido antes de enviar la prueba." });
      return;
    }
    busyRef.current = true;
    setTesting(true);
    setNotice(null);
    try {
      const res = await fetch("/api/send-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...providerConfigFrom(form), to: form.senderEmail }),
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
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold text-white">Configuración del Remitente</h3>
          <p className="mt-1 text-xs text-slate-500">
            Quién envía, por qué canal y cómo verificarlo. Las claves se guardan ofuscadas en este dispositivo.
          </p>
        </div>
        <span
          className={`badge shrink-0 ${
            configured ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" : "border-white/10 text-slate-400"
          }`}
        >
          {configured ? "Listo" : "Sin configurar"}
        </span>
      </div>

      {/* 1. Identidad */}
      <Block step={1} icon={UserRound} title="Identidad del remitente" text="Así te verán tus prospectos en su bandeja.">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field
            label="Nombre del Remitente"
            value={form.senderName}
            onChange={(v) => patch("senderName", v)}
            placeholder={SENDER_NAME_PLACEHOLDER}
            hint="Usa «Nombre | Empresa» para rellenar la firma."
          />
          <Field
            label="Correo Remitente"
            type="email"
            value={form.senderEmail}
            onChange={(v) => patch("senderEmail", v)}
            placeholder={SENDER_EMAIL_PLACEHOLDER}
          />
          <Field
            label="Teléfono para la firma (opcional)"
            type="tel"
            value={form.senderPhone}
            onChange={(v) => patch("senderPhone", v)}
            placeholder="+507 6000-0000"
          />
          <Field
            label="Sitio web de tu empresa (opcional)"
            type="url"
            value={form.senderWebsite}
            onChange={(v) => patch("senderWebsite", v)}
            placeholder="https://tuempresa.com"
            hint="Se usa como enlace del botón de las plantillas."
          />
          <Field
            label="Correo de Respuesta (Reply-To)"
            type="email"
            value={form.replyTo}
            onChange={(v) => patch("replyTo", v)}
            placeholder={REPLY_TO_PLACEHOLDER}
          />
        </div>
        <div className="mt-3">
          <LogoField value={form.logoUrl} onChange={(v) => patch("logoUrl", v)} />
        </div>
        {/* Bandeja de entrada simulada */}
        <div className="mt-3 flex items-center gap-3 rounded-xl border border-white/[0.07] bg-white px-3.5 py-2.5 text-slate-900">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-violet-600 text-xs font-bold text-white">
            {(form.senderName.trim() || form.senderEmail.trim() || "?").slice(0, 1).toUpperCase()}
          </span>
          <div className="min-w-0 text-xs">
            <p className="truncate font-semibold">{form.senderName.split("|")[0].trim() || "Tu nombre"}</p>
            <p className="truncate text-slate-500">{form.senderEmail || "correo@tudominio.com"} · así se verá en la bandeja</p>
          </div>
        </div>
      </Block>

      {/* 2. Canal */}
      <Block step={2} icon={PlugZap} title="Canal de envío" text="Elige por dónde salen tus correos.">
        <div role="radiogroup" aria-label="Canal de envío" className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {MAILER_MODES.map((mode) => {
            const active = form.mode === mode.id;
            const meta = MODE_META[mode.id];
            const Icon = meta.icon;
            return (
              <button
                key={mode.id}
                type="button"
                role="radio"
                aria-checked={active}
                aria-label={mode.label}
                onClick={() => patch("mode", mode.id)}
                className={`flex flex-col items-start gap-2 rounded-xl border p-3 text-left transition ${
                  active
                    ? "border-violet-400/50 bg-violet-500/15 ring-1 ring-violet-400/25"
                    : "border-white/[0.07] bg-white/[0.015] hover:border-white/15"
                }`}
              >
                <Icon className={`h-4 w-4 ${active ? "text-violet-200" : "text-slate-500"}`} />
                <span className={`text-xs font-semibold ${active ? "text-white" : "text-slate-300"}`}>{mode.label}</span>
                <span className="text-[10px] leading-snug text-slate-500">{meta.blurb}</span>
              </button>
            );
          })}
        </div>

        <div className="mt-4 space-y-3">
          {form.mode === "gmail" && (
            <SecretField
              label="App Password de Gmail"
              value={form.appPassword}
              onChange={(v) => patch("appPassword", v)}
              placeholder="xxxx xxxx xxxx xxxx"
            />
          )}

          {form.mode === "smtp" && (
            <>
              <div className="flex flex-wrap gap-1.5">
                <span className="mr-1 self-center text-[11px] text-slate-500">Accesos rápidos:</span>
                {SMTP_PRESETS.map((p) => (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => setForm((prev) => ({ ...prev, smtpHost: p.host, smtpPort: p.port }))}
                    className={`chip transition hover:border-violet-400/40 hover:text-white ${
                      form.smtpHost === p.host ? "border-violet-400/50 bg-violet-500/15 text-white" : ""
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <Field
                    label="Servidor SMTP"
                    value={form.smtpHost}
                    onChange={(v) => patch("smtpHost", v)}
                    placeholder="smtp.tudominio.com"
                  />
                </div>
                <Field label="Puerto" value={form.smtpPort} onChange={(v) => patch("smtpPort", v)} placeholder="587" />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
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
              </div>
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
            <p className="rounded-xl border border-sky-500/25 bg-sky-500/10 p-3 text-[11px] text-sky-200">
              Modo demostración: el flujo completo funciona pero no se envía ningún correo real. Algunos envíos
              simulan rebotes para que veas cómo se registran los errores.
            </p>
          )}

          {steps && (
            <ol className="list-decimal space-y-1 rounded-xl border border-white/[0.07] bg-white/[0.02] py-3 pr-3 pl-8 text-[11px] leading-relaxed text-slate-400">
              {steps.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ol>
          )}
        </div>
      </Block>

      {/* 3. Guardar y verificar */}
      <Block step={3} icon={ShieldCheck} title="Guardar y verificar" text="Comprueba las credenciales y recibe un correo de prueba.">
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={onSave} className="btn btn-primary flex-1">
            Guardar Remitente
          </button>
          <button
            type="button"
            onClick={onTestConnection}
            disabled={checking}
            className="btn border border-sky-500/30 bg-sky-500/10 text-sky-200 hover:bg-sky-500/20"
          >
            {checking ? <Spinner /> : <PlugZap className="h-4 w-4" />}
            {checking ? "Probando…" : "Probar Conexión"}
          </button>
          <button
            type="button"
            onClick={onTestEmail}
            disabled={testing}
            className="btn border border-emerald-500/30 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/20"
          >
            {testing ? <Spinner /> : <Send className="h-4 w-4" />}
            {testing ? "Enviando…" : "Enviar Correo de Prueba"}
          </button>
          <button type="button" onClick={onClear} className="btn btn-ghost">
            Borrar claves
          </button>
        </div>

        {connection && <NoticeLine notice={connection} />}
        {notice && <NoticeLine notice={notice} />}
      </Block>
    </div>
  );
}

function Block({
  step,
  icon: Icon,
  title,
  text,
  children,
}: {
  step: number;
  icon: LucideIcon;
  title: string;
  text: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-white/[0.07] bg-white/[0.015] p-4 sm:p-5">
      <div className="mb-4 flex items-start gap-3">
        <span className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-violet-500/15 text-violet-300">
          <Icon className="h-4 w-4" />
          <span className="absolute -top-1.5 -right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-violet-500 text-[9px] font-bold text-white">
            {step}
          </span>
        </span>
        <div>
          <p className="text-sm font-semibold text-white">{title}</p>
          <p className="text-[11px] text-slate-500">{text}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

function NoticeLine({ notice }: { notice: { tone: Tone; text: string } }) {
  const ok = notice.tone === "ok";
  return (
    <p
      className={`mt-3 flex items-start gap-2 rounded-xl border px-3 py-2 text-xs ${
        ok ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-200" : "border-rose-500/25 bg-rose-500/10 text-rose-200"
      }`}
    >
      {ok ? <CheckCircle2 className="mt-px h-3.5 w-3.5 shrink-0" /> : <XCircle className="mt-px h-3.5 w-3.5 shrink-0" />}
      {notice.text}
    </p>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  type?: string;
  hint?: string;
}) {
  const id = useId();
  return (
    <div className="block">
      <label htmlFor={id} className="label">
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
        className="input"
      />
      {hint && <p className="mt-1 text-[10px] text-slate-500">{hint}</p>}
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
      <label htmlFor={id} className="label">
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
          className="input"
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? "Ocultar" : "Mostrar"}
          className="btn btn-secondary shrink-0 px-3"
        >
          {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}
