"use client";

import { useState, useSyncExternalStore, type ReactNode } from "react";
import {
  CheckCircle2,
  ChevronDown,
  Cloud,
  Cpu,
  ExternalLink,
  Eye,
  EyeOff,
  Mail,
  MapPin,
  PlugZap,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { useAppState } from "./app-state";
import { PageHeader, Spinner } from "./ui";
import { SenderSettings } from "./sender-settings";
import {
  DEFAULT_APIFY_ACTOR,
  DEFAULT_EMAIL_ACTOR,
  getProvidersSnapshot,
  getServerProvidersSnapshot,
  saveProviderConfig,
  subscribeProviders,
  type EngineId,
} from "@/lib/providers";
import {
  getMailerSnapshot,
  getServerMailerSnapshot,
  isMailerConfigured,
  mailerModeLabel,
  subscribeMailer,
} from "@/lib/mailer";

type TestState = { status: "idle" } | { status: "testing" } | { status: "ok" | "error"; message: string };

async function testProvider(provider: "local" | "google" | "apify", key = ""): Promise<{ ok: boolean; message: string }> {
  try {
    const res = await fetch("/api/test-provider", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider, key }),
    });
    const data = await res.json().catch(() => null);
    return { ok: res.ok && data?.success === true, message: data?.message ?? `Error ${res.status}` };
  } catch {
    return { ok: false, message: "Error de conexión con el servidor." };
  }
}

export function Connectors() {
  const config = useSyncExternalStore(subscribeProviders, getProvidersSnapshot, getServerProvidersSnapshot);
  const mailer = useSyncExternalStore(subscribeMailer, getMailerSnapshot, getServerMailerSnapshot);
  const { notify } = useAppState();

  function setEngine(engine: EngineId) {
    saveProviderConfig({ ...config, engine });
    notify("success", "Motor de búsqueda actualizado");
  }

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Conectores"
        title="Conecta tus herramientas"
        description="Todo funciona sin claves gracias al motor local gratuito. Añade una API solo si quieres más velocidad o volumen. Las claves se guardan únicamente en este navegador."
      />

      <section className="space-y-4">
        <SectionTitle
          title="Búsqueda de prospectos"
          text="Elige el motor predeterminado. Si una API falla, la app usa el motor local automáticamente."
        />
        <div className="grid gap-4 lg:grid-cols-3">
          <LocalConnector active={config.engine === "free"} onUse={() => setEngine("free")} />
          <KeyConnector
            id="google"
            icon={MapPin}
            name="Google Places API"
            tagline="Datos oficiales de Google Maps. Muy preciso."
            price="De pago (Google ofrece crédito mensual gratuito)"
            value={config.googleKey}
            placeholder="AIzaSy…"
            active={config.engine === "google"}
            onSave={(key) => {
              saveProviderConfig({ ...config, googleKey: key, engine: key ? "google" : config.engine === "google" ? "free" : config.engine });
              notify("success", key ? "Google Places conectado" : "Clave de Google eliminada");
            }}
            onUse={() => setEngine("google")}
            steps={[
              "Entra a console.cloud.google.com y crea (o elige) un proyecto.",
              "Activa la facturación del proyecto (Google regala crédito mensual).",
              "Busca «Places API (New)» en la biblioteca de APIs y pulsa Habilitar.",
              "Ve a Credenciales › Crear credenciales › Clave de API y cópiala aquí.",
            ]}
            link="https://console.cloud.google.com/apis/library/places.googleapis.com"
          />
          <KeyConnector
            id="apify"
            icon={Cloud}
            name="Apify Cloud"
            tagline="Scraper de Google Maps en la nube. Ideal para volúmenes grandes."
            price="Plan gratuito con créditos mensuales"
            value={config.apifyToken}
            placeholder="apify_api_…"
            active={config.engine === "apify"}
            onSave={(key) => {
              saveProviderConfig({ ...config, apifyToken: key, engine: key ? "apify" : config.engine === "apify" ? "free" : config.engine });
              notify("success", key ? "Apify conectado" : "Token de Apify eliminado");
            }}
            onUse={() => setEngine("apify")}
            steps={[
              "Crea una cuenta gratuita en apify.com.",
              "Abre Apify Console › Settings › API & Integrations.",
              "Copia tu «Personal API token» y pégalo aquí.",
            ]}
            link="https://console.apify.com/settings/integrations"
            advanced={
              <ApifyAdvanced
                actor={config.apifyActor}
                emailActor={config.emailActor}
                onSave={(apifyActor, emailActor) => {
                  saveProviderConfig({ ...config, apifyActor, emailActor });
                  notify("success", "Actores de Apify guardados");
                }}
              />
            }
          />
        </div>
      </section>

      <section className="space-y-4">
        <SectionTitle
          title="Envío de correos"
          text="Conecta el canal con el que se enviarán tus campañas. Usa «Probar Conexión» y «Enviar Correo de Prueba» antes de una campaña."
        />
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="card card-pad">
            <SenderSettings />
          </div>
          <div className="space-y-3">
            <div className="card card-pad">
              <div className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-violet-300" />
                <p className="text-sm font-semibold text-white">Estado del remitente</p>
              </div>
              <p className={`mt-3 flex items-center gap-2 text-sm ${isMailerConfigured(mailer) ? "text-emerald-300" : "text-amber-300"}`}>
                {isMailerConfigured(mailer) ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                {isMailerConfigured(mailer) ? `Listo · ${mailerModeLabel(mailer.mode)}` : "Sin configurar"}
              </p>
            </div>
            <MiniGuide
              title="¿Qué canal elijo?"
              items={[
                ["Gmail", "Para empezar. Hasta ~500 correos/día. Requiere App Password."],
                ["SMTP", "Tu correo corporativo (Outlook, Zoho, Hostinger, cPanel…)."],
                ["Resend / SendGrid", "Volumen alto y mejor entregabilidad con dominio verificado."],
                ["Simulado", "Prueba todo el flujo sin enviar correos reales."],
              ]}
            />
          </div>
        </div>
      </section>
    </div>
  );
}

function SectionTitle({ title, text }: { title: string; text: string }) {
  return (
    <div>
      <h2 className="text-base font-semibold text-white">{title}</h2>
      <p className="mt-0.5 text-xs text-slate-500">{text}</p>
    </div>
  );
}

function StatusPill({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className={`badge ${ok ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" : "border-white/10 text-slate-400"}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${ok ? "bg-emerald-400" : "bg-slate-500"}`} />
      {label}
    </span>
  );
}

function TestResult({ state }: { state: TestState }) {
  if (state.status === "idle" || state.status === "testing") return null;
  const ok = state.status === "ok";
  return (
    <p
      role="status"
      className={`mt-3 flex items-start gap-2 rounded-xl border px-3 py-2 text-[11px] leading-relaxed ${
        ok ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-200" : "border-rose-500/25 bg-rose-500/10 text-rose-200"
      }`}
    >
      {ok ? <CheckCircle2 className="mt-px h-3.5 w-3.5 shrink-0" /> : <XCircle className="mt-px h-3.5 w-3.5 shrink-0" />}
      {state.message}
    </p>
  );
}

function ConnectorShell({
  icon: Icon,
  name,
  tagline,
  status,
  active,
  children,
}: {
  icon: LucideIcon;
  name: string;
  tagline: string;
  status: ReactNode;
  active: boolean;
  children: ReactNode;
}) {
  return (
    <div className={`card card-pad flex flex-col ${active ? "ring-1 ring-violet-400/40" : ""}`}>
      <div className="flex items-start gap-3">
        <span
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${
            active ? "bg-gradient-to-br from-violet-500/30 to-indigo-500/10 text-violet-200" : "bg-white/[0.05] text-slate-400"
          }`}
        >
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold text-white">{name}</p>
            {status}
          </div>
          <p className="mt-0.5 text-xs text-slate-500">{tagline}</p>
        </div>
      </div>
      <div className="mt-4 flex flex-1 flex-col">{children}</div>
    </div>
  );
}

function LocalConnector({ active, onUse }: { active: boolean; onUse: () => void }) {
  const [test, setTest] = useState<TestState>({ status: "idle" });
  return (
    <ConnectorShell
      icon={Cpu}
      name="Motor local gratuito"
      tagline="Google Maps + OpenStreetMap + rastreo web. Sin claves."
      status={<StatusPill ok label="Siempre activo" />}
      active={active}
    >
      <ul className="space-y-1.5 text-xs text-slate-400">
        <li>✓ Funciona en cualquier país y nicho</li>
        <li>✓ Extrae correos, WhatsApp y redes de cada web</li>
        <li>✓ Sin costo ni límite de créditos</li>
      </ul>
      <TestResult state={test} />
      <div className="mt-auto flex gap-2 pt-4">
        <button
          type="button"
          onClick={async () => {
            setTest({ status: "testing" });
            const r = await testProvider("local");
            setTest({ status: r.ok ? "ok" : "error", message: r.message });
          }}
          disabled={test.status === "testing"}
          className="btn btn-sm btn-secondary flex-1"
        >
          {test.status === "testing" ? <Spinner className="h-3.5 w-3.5" /> : <PlugZap className="h-3.5 w-3.5" />} Probar
        </button>
        <button type="button" onClick={onUse} disabled={active} className="btn btn-sm btn-primary flex-1">
          {active ? "En uso" : "Usar este motor"}
        </button>
      </div>
    </ConnectorShell>
  );
}

function KeyConnector({
  id,
  icon,
  name,
  tagline,
  price,
  value,
  placeholder,
  active,
  onSave,
  onUse,
  steps,
  link,
  advanced,
}: {
  id: "google" | "apify";
  icon: LucideIcon;
  name: string;
  tagline: string;
  price: string;
  value: string;
  placeholder: string;
  active: boolean;
  onSave: (key: string) => void;
  onUse: () => void;
  steps: string[];
  link: string;
  advanced?: ReactNode;
}) {
  const [draft, setDraft] = useState(value);
  const [visible, setVisible] = useState(false);
  const [test, setTest] = useState<TestState>({ status: "idle" });
  const [help, setHelp] = useState(false);
  const connected = value.trim().length > 0;
  const dirty = draft.trim() !== value.trim();

  return (
    <ConnectorShell
      icon={icon}
      name={name}
      tagline={tagline}
      status={<StatusPill ok={connected} label={connected ? "Conectado" : "Sin clave"} />}
      active={active}
    >
      <p className="text-[11px] text-slate-500">{price}</p>
      <label htmlFor={`key-${id}`} className="label mt-3">
        API Key
      </label>
      <div className="flex gap-2">
        <input
          id={`key-${id}`}
          type={visible ? "text" : "password"}
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            setTest({ status: "idle" });
          }}
          placeholder={placeholder}
          autoComplete="off"
          spellCheck={false}
          className="input py-2 text-xs"
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? "Ocultar clave" : "Mostrar clave"}
          className="btn btn-sm btn-secondary px-2.5"
        >
          {visible ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
        </button>
      </div>
      <TestResult state={test} />

      <button
        type="button"
        onClick={() => setHelp((h) => !h)}
        aria-expanded={help}
        className="mt-3 flex items-center gap-1 self-start text-[11px] font-medium text-violet-300 hover:text-violet-200"
      >
        ¿Cómo obtengo la clave? <ChevronDown className={`h-3 w-3 transition ${help ? "rotate-180" : ""}`} />
      </button>
      {help && (
        <div className="animate-fade-in mt-2 rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
          <ol className="list-decimal space-y-1 pl-4 text-[11px] leading-relaxed text-slate-400">
            {steps.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
          <a
            href={link}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-sky-300 hover:underline"
          >
            Abrir consola <ExternalLink className="h-3 w-3" />
          </a>
          {advanced}
        </div>
      )}

      <div className="mt-auto flex flex-wrap gap-2 pt-4">
        <button
          type="button"
          onClick={async () => {
            setTest({ status: "testing" });
            const r = await testProvider(id, draft);
            setTest({ status: r.ok ? "ok" : "error", message: r.message });
          }}
          disabled={!draft.trim() || test.status === "testing"}
          className="btn btn-sm btn-secondary flex-1"
        >
          {test.status === "testing" ? <Spinner className="h-3.5 w-3.5" /> : <PlugZap className="h-3.5 w-3.5" />} Probar
        </button>
        {dirty ? (
          <button type="button" onClick={() => onSave(draft.trim())} className="btn btn-sm btn-primary flex-1">
            {draft.trim() ? "Guardar y usar" : "Eliminar clave"}
          </button>
        ) : (
          <button type="button" onClick={onUse} disabled={!connected || active} className="btn btn-sm btn-primary flex-1">
            {active ? "En uso" : "Usar este motor"}
          </button>
        )}
      </div>
    </ConnectorShell>
  );
}

function ApifyAdvanced({
  actor,
  emailActor,
  onSave,
}: {
  actor: string;
  emailActor: string;
  onSave: (actor: string, emailActor: string) => void;
}) {
  const [a, setA] = useState(actor);
  const [e, setE] = useState(emailActor);
  return (
    <div className="mt-3 space-y-2 border-t border-white/[0.06] pt-3">
      <p className="text-[11px] font-semibold text-slate-300">Avanzado</p>
      <label className="block">
        <span className="label">Actor de Google Maps</span>
        <input value={a} onChange={(ev) => setA(ev.target.value)} placeholder={DEFAULT_APIFY_ACTOR} className="input py-2 text-xs" />
      </label>
      <label className="block">
        <span className="label">Actor de extracción de correos</span>
        <input value={e} onChange={(ev) => setE(ev.target.value)} placeholder={DEFAULT_EMAIL_ACTOR} className="input py-2 text-xs" />
      </label>
      <button type="button" onClick={() => onSave(a, e)} className="btn btn-sm btn-secondary">
        Guardar actores
      </button>
    </div>
  );
}

function MiniGuide({ title, items }: { title: string; items: [string, string][] }) {
  return (
    <div className="card card-pad">
      <p className="text-sm font-semibold text-white">{title}</p>
      <dl className="mt-3 space-y-2.5">
        {items.map(([k, v]) => (
          <div key={k}>
            <dt className="text-xs font-semibold text-slate-200">{k}</dt>
            <dd className="text-[11px] leading-relaxed text-slate-500">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
