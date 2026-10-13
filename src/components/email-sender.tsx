"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Circle,
  FlaskConical,
  Gauge,
  Info,
  LayoutTemplate,
  Mail,
  Send,
  ShieldCheck,
  Type,
  Users,
  type LucideIcon,
} from "lucide-react";
import { hasValidEmail, useAppState } from "./app-state";
import { RecipientList } from "./recipient-list";
import { TemplateEditor } from "./template-editor";
import { SenderSettings } from "./sender-settings";
import { SendModal, type SendLogEntry } from "./send-monitor-modal";
import { Modal } from "./modal";
import { PageHeader, Spinner, Toggle } from "./ui";
import {
  CHIPS,
  renderTemplate,
  resolvePlaceholderLinks,
  senderExtras,
  spamSignals,
  withPreheader,
  withUnsubscribeNotice,
} from "@/lib/template";
import { SuppressionManager } from "./suppression-manager";
import { EMAIL_TEMPLATES } from "@/lib/email-templates";
import {
  averageDelaySec,
  getMailerSnapshot,
  getServerMailerSnapshot,
  isMailerConfigured,
  mailerModeLabel,
  providerConfigFrom,
  randomDelaySec,
  subscribeMailer,
  updateMailerConfig,
  type MailerConfig,
} from "@/lib/mailer";
import { DAILY_LIMITS, sentToday } from "@/lib/email-providers";
import { formatDuration } from "@/lib/format";
import type { Prospect, SendStatus } from "@/lib/types";

type Phase = "idle" | "confirm" | "sending" | "done";
type SectionId = "to" | "from" | "subject" | "content" | "delivery";

const DEFAULT_TEMPLATE = EMAIL_TEMPLATES[0];
const IS_TEST = process.env.NODE_ENV === "test";
const DRAFT_KEY = "b2b.campaign.draft.v1";

interface Draft {
  subject: string;
  preheader: string;
  body: string;
  templateId: string;
  unsubscribe: boolean;
}

/** Construye el HTML final de un correo para un destinatario concreto. */
function buildEmailHtml(
  r: Prospect,
  body: string,
  preheader: string,
  mailer: MailerConfig,
  unsubscribe: boolean
): string {
  const extras = senderExtras(mailer);
  let html = resolvePlaceholderLinks(renderTemplate(body, r, extras), mailer);
  if (unsubscribe) html = withUnsubscribeNotice(html, mailer.replyTo || mailer.senderEmail);
  return withPreheader(html, renderTemplate(preheader, r, extras));
}

interface SendOutcome {
  ok: boolean;
  message?: string;
}

async function sendEmail(
  r: Prospect,
  subject: string,
  preheader: string,
  body: string,
  unsubscribe: boolean
): Promise<SendOutcome> {
  try {
    const mailer = getMailerSnapshot();
    const extras = senderExtras(mailer);
    const res = await fetch("/api/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...providerConfigFrom(mailer),
        to: r.correo,
        subject: renderTemplate(subject, r, extras),
        body: buildEmailHtml(r, body, preheader, mailer, unsubscribe),
      }),
    });
    const data = await res.json().catch(() => null);
    if (res.ok && data?.success === true) return { ok: true };
    if (res.status === 429) return { ok: false, message: "Límite de envíos alcanzado; reintenta más tarde." };
    return { ok: false, message: typeof data?.message === "string" ? data.message : `Error ${res.status}` };
  } catch {
    return { ok: false, message: "Error de conexión con el servidor." };
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function loadDraft(): Draft | null {
  try {
    const raw = window.localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw) as Partial<Draft>;
    if (typeof d.subject !== "string" || typeof d.body !== "string") return null;
    return {
      subject: d.subject,
      preheader: typeof d.preheader === "string" ? d.preheader : "",
      body: d.body,
      templateId: typeof d.templateId === "string" ? d.templateId : DEFAULT_TEMPLATE.id,
      unsubscribe: d.unsubscribe !== false,
    };
  } catch {
    return null;
  }
}

export function EmailSender() {
  const {
    recipients,
    clearRecipients,
    removeRecipient,
    dialog,
    openDialog,
    closeDialog,
    addCampaign,
    campaigns,
    contactedEmails,
    suppressedSet,
    notify,
  } = useAppState();
  const [unsubscribe, setUnsubscribe] = useState(true);
  const [suppressionOpen, setSuppressionOpen] = useState(false);
  const [subject, setSubject] = useState(DEFAULT_TEMPLATE.subject);
  const [preheader, setPreheader] = useState("");
  const [body, setBody] = useState(DEFAULT_TEMPLATE.html);
  const [templateId, setTemplateId] = useState(DEFAULT_TEMPLATE.id);
  const [editorKey, setEditorKey] = useState(0);
  const [draftReady, setDraftReady] = useState(false);
  const [collapsed, setCollapsed] = useState<Partial<Record<SectionId, boolean>>>({});
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState<SendStatus>({ total: 0, sent: 0, failed: 0, pending: 0, current: 0 });
  const [log, setLog] = useState<SendLogEntry[]>([]);
  const [paused, setPaused] = useState(false);
  const [nextIn, setNextIn] = useState(0);
  const [testing, setTesting] = useState(false);
  const cancelRef = useRef(false);
  const pausedRef = useRef(false);

  const mailer = useSyncExternalStore(subscribeMailer, getMailerSnapshot, getServerMailerSnapshot);
  const configured = isMailerConfigured(mailer);
  const delayMinSec = mailer.delayMinSec;
  const delayMaxSec = mailer.delayMaxSec;

  // Borrador de la campaña (asunto, preheader, cuerpo y plantilla) persistente.
  useEffect(() => {
    const draft = loadDraft();
    /* eslint-disable react-hooks/set-state-in-effect -- restauración única del borrador guardado */
    if (draft) {
      setSubject(draft.subject);
      setPreheader(draft.preheader);
      setBody(draft.body);
      setTemplateId(draft.templateId);
      setUnsubscribe(draft.unsubscribe);
      setEditorKey((k) => k + 1);
    }
    setDraftReady(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  useEffect(() => {
    if (!draftReady) return;
    try {
      window.localStorage.setItem(DRAFT_KEY, JSON.stringify({ subject, preheader, body, templateId, unsubscribe }));
    } catch {
      // sin almacenamiento
    }
  }, [draftReady, subject, preheader, body, templateId, unsubscribe]);

  const withEmail = useMemo(() => recipients.filter(hasValidEmail), [recipients]);
  const sendable = useMemo(
    () => withEmail.filter((r) => !suppressedSet.has(r.correo.trim().toLowerCase())),
    [withEmail, suppressedSet]
  );
  const invalidCount = recipients.length - withEmail.length;
  const suppressedCount = withEmail.length - sendable.length;
  const contactedCount = sendable.filter((r) => contactedEmails.has(r.correo.trim().toLowerCase())).length;
  const total = sendable.length;
  const estimated = formatDuration(Math.max(0, total - 1) * averageDelaySec(delayMinSec, delayMaxSec));
  const previewSample = sendable[0];
  const signals = useMemo(() => spamSignals(subject, body), [subject, body]);
  const warnings = signals.filter((s) => s.level === "warn").length;
  const cap = DAILY_LIMITS[mailer.mode];
  const today = sentToday(campaigns);
  const overCap = cap > 0 && today + total > cap;

  const fromLabel = mailer.senderEmail
    ? `${mailer.senderName.split("|")[0].trim() || mailer.senderEmail} <${mailer.senderEmail}>`
    : "";

  const checks: Record<SectionId, boolean> = {
    to: total > 0,
    from: configured,
    subject: subject.trim().length > 0,
    content: body.trim().length > 0,
    delivery: true,
  };
  const ready = Object.values(checks).every(Boolean);

  function toggle(id: SectionId) {
    setCollapsed((c) => ({ ...c, [id]: !c[id] }));
  }

  function setDelayRange(min: number, max: number) {
    const next: Partial<MailerConfig> = { delayMinSec: min, delayMaxSec: max };
    updateMailerConfig(next);
  }

  function startCampaign() {
    if (total === 0) return;
    if (!configured) {
      notify("error", "Configura el remitente", "Necesitas un remitente y un canal de envío antes de lanzar la campaña.");
      openDialog("sender");
      return;
    }
    if (!subject.trim()) {
      notify("error", "Falta el asunto", "Escribe un asunto para la campaña.");
      return;
    }
    setPhase("confirm");
  }

  async function waitDelay(totalSec: number) {
    for (let left = totalSec; left > 0; left--) {
      if (cancelRef.current) return;
      setNextIn(left);
      await sleep(1000);
      while (pausedRef.current && !cancelRef.current) await sleep(250);
    }
    setNextIn(0);
  }

  async function onConfirm() {
    if (phase === "sending") return;
    cancelRef.current = false;
    pausedRef.current = false;
    setPaused(false);
    setLog([]);
    setPhase("sending");

    const list = sendable;
    const entries: SendLogEntry[] = [];
    let sent = 0;
    let failed = 0;
    setProgress({ total: list.length, sent: 0, failed: 0, pending: list.length, current: 0 });

    for (let i = 0; i < list.length; i++) {
      while (pausedRef.current && !cancelRef.current) await sleep(250);
      if (cancelRef.current) break;
      const r = list[i];
      setProgress((p) => ({ ...p, current: i + 1 }));
      const outcome = await sendEmail(r, subject, preheader, body, unsubscribe);
      if (outcome.ok) sent++;
      else failed++;
      const entry: SendLogEntry = { email: r.correo, empresa: r.empresa, ok: outcome.ok, message: outcome.message };
      entries.push(entry);
      setLog((l) => [entry, ...l]);
      setProgress((p) => ({ ...p, sent, failed, pending: Math.max(0, list.length - (i + 1)) }));
      if (i < list.length - 1 && !cancelRef.current) {
        await waitDelay(IS_TEST ? 0 : randomDelaySec(delayMinSec, delayMaxSec));
      }
    }

    addCampaign({
      id: `c-${Date.now()}`,
      createdAt: Date.now(),
      subject: subject.replace(/\{\{\s*[a-záéíóúñ_]+\s*\}\}/gi, "…").trim() || "Campaña",
      mode: mailer.mode,
      total: list.length,
      sent,
      failed,
      cancelled: cancelRef.current,
      results: entries,
    });
    setNextIn(0);
    setPhase("done");
  }

  function onCancel() {
    cancelRef.current = true;
    pausedRef.current = false;
    setPaused(false);
  }

  function onTogglePause() {
    pausedRef.current = !pausedRef.current;
    setPaused(pausedRef.current);
  }

  function onClose() {
    setPhase("idle");
    setProgress({ total: 0, sent: 0, failed: 0, pending: 0, current: 0 });
  }

  async function sendTemplateTest() {
    if (!configured) {
      openDialog("sender");
      return;
    }
    setTesting(true);
    try {
      const sample: Prospect = previewSample ?? {
        id: "test",
        nombre: "",
        empresa: "Empresa de Ejemplo",
        correo: mailer.senderEmail,
        telefono: "",
        whatsapp: "",
        direccion: "",
        website: "",
        ciudad: "",
        rubro: "",
      };
      const extras = senderExtras(mailer);
      const res = await fetch("/api/send-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...providerConfigFrom(mailer),
          to: mailer.senderEmail,
          subject: `[Prueba] ${renderTemplate(subject, sample, extras)}`,
          body: buildEmailHtml(sample, body, preheader, mailer, unsubscribe),
        }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.success) notify("success", "Prueba enviada", `Revisa la bandeja de ${mailer.senderEmail}.`);
      else notify("error", "No se pudo enviar la prueba", data?.message);
    } catch {
      notify("error", "Error de conexión al enviar la prueba");
    } finally {
      setTesting(false);
    }
  }

  const sample = previewSample ?? {
    id: "s",
    nombre: "",
    empresa: "Empresa de Ejemplo",
    correo: "",
    telefono: "",
    whatsapp: "",
    direccion: "",
    website: "",
    ciudad: "Ciudad de Ejemplo",
    rubro: "Servicios",
  };
  const previewExtras = senderExtras(mailer, { preview: true });

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Campañas"
        title="Envío Rápido"
        description="Completa cada paso de la lista: destinatarios, remitente, asunto, contenido y envío."
        actions={
          <button type="button" onClick={() => openDialog("sender")} className="btn btn-secondary">
            <span className={`h-2 w-2 rounded-full ${configured ? "bg-emerald-400" : "bg-amber-400"}`} />
            Ajustes del Remitente
          </button>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="card min-w-0 divide-y divide-white/[0.06] overflow-hidden">
          {/* PARA */}
          <Section
            icon={Users}
            title="Para"
            done={checks.to}
            summary={
              total > 0
                ? `${total} destinatario${total === 1 ? "" : "s"} con correo válido${
                    invalidCount + suppressedCount ? ` · ${invalidCount + suppressedCount} se omitirán` : ""
                  }`
                : "Añade destinatarios desde el Buscador o con un CSV"
            }
            collapsed={collapsed.to}
            onToggle={() => toggle("to")}
            extra={
              <>
                <button type="button" onClick={() => setSuppressionOpen(true)} className="btn btn-sm btn-ghost">
                  Lista de bajas
                </button>
                {recipients.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm("¿Quitar todos los destinatarios de la lista?")) clearRecipients();
                  }}
                  className="btn btn-sm btn-ghost"
                >
                  Limpiar lista
                </button>
                )}
              </>
            }
          >
            <RecipientList />
            {suppressedCount > 0 && (
              <p className="mt-3 flex items-center gap-2 rounded-xl border border-rose-500/20 bg-rose-500/[0.06] px-3 py-2 text-[11px] text-rose-200">
                <AlertTriangle className="h-3.5 w-3.5" />
                {suppressedCount} destinatario{suppressedCount === 1 ? "" : "s"} está{suppressedCount === 1 ? "" : "n"} en tu
                lista de bajas y no recibirá{suppressedCount === 1 ? "" : "n"} la campaña.
              </p>
            )}
            {contactedCount > 0 && (
              <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-violet-500/25 bg-violet-500/10 px-3 py-2 text-[11px] text-violet-200">
                <Info className="h-3.5 w-3.5" />
                {contactedCount} ya recibieron una campaña anterior.
                <button
                  type="button"
                  className="font-semibold underline"
                  onClick={() => {
                    for (const r of sendable) {
                      if (contactedEmails.has(r.correo.trim().toLowerCase())) removeRecipient(r.id);
                    }
                  }}
                >
                  Quitarlos de la lista
                </button>
              </div>
            )}
          </Section>

          {/* DE */}
          <Section
            icon={Mail}
            title="De"
            done={checks.from}
            summary={configured ? `${fromLabel} · ${mailerModeLabel(mailer.mode)}` : "Configura quién envía y por qué canal"}
            collapsed={collapsed.from}
            onToggle={() => toggle("from")}
          >
            {configured ? (
              <div className="flex flex-wrap items-center gap-3 rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-violet-600 text-sm font-bold text-white">
                  {(mailer.senderName || mailer.senderEmail).slice(0, 1).toUpperCase()}
                </span>
                <div className="min-w-0 flex-1 text-xs">
                  <p className="truncate font-semibold text-slate-100">{fromLabel}</p>
                  <p className="text-slate-500">
                    Canal: {mailerModeLabel(mailer.mode)}
                    {mailer.replyTo ? ` · Respuestas a ${mailer.replyTo}` : ""}
                    {mailer.logoUrl ? " · Con logo" : ""}
                  </p>
                </div>
                <button type="button" onClick={() => openDialog("sender")} className="btn btn-sm btn-secondary">
                  Editar remitente
                </button>
              </div>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-500/25 bg-amber-500/10 p-3 text-xs text-amber-200">
                <span className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4" /> Aún no hay remitente configurado.
                </span>
                <button type="button" onClick={() => openDialog("sender")} className="btn btn-sm btn-primary">
                  Configurar remitente
                </button>
              </div>
            )}
          </Section>

          {/* ASUNTO */}
          <Section
            icon={Type}
            title="Asunto"
            done={checks.subject}
            summary={subject.trim() ? renderTemplate(subject, sample, previewExtras) : "¿De qué trata tu campaña?"}
            collapsed={collapsed.subject}
            onToggle={() => toggle("subject")}
          >
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="space-y-3">
                <div>
                  <div className="flex items-center justify-between">
                    <label htmlFor="tpl-subject" className="label">
                      Asunto
                    </label>
                    <span className={`text-[10px] tabular-nums ${subject.length > 60 ? "text-amber-300" : "text-slate-500"}`}>
                      {subject.length}/60
                    </span>
                  </div>
                  <input id="tpl-subject" value={subject} onChange={(e) => setSubject(e.target.value)} className="input" />
                </div>
                <div>
                  <div className="flex items-center justify-between">
                    <label htmlFor="tpl-preheader" className="label">
                      Texto de vista previa
                    </label>
                    <span className="text-[10px] text-slate-500 tabular-nums">{preheader.length}/100</span>
                  </div>
                  <input
                    id="tpl-preheader"
                    value={preheader}
                    maxLength={150}
                    onChange={(e) => setPreheader(e.target.value)}
                    placeholder="Ej: Una idea concreta para conseguir más clientes en {{ciudad}}"
                    className="input"
                  />
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {CHIPS.slice(0, 4).map((c) => (
                    <button
                      key={c.token}
                      type="button"
                      onClick={() => setSubject((s) => `${s}${s.endsWith(" ") || !s ? "" : " "}${c.token}`)}
                      className="rounded-md border border-violet-400/20 bg-violet-500/10 px-2 py-1 text-[11px] font-medium text-violet-200 transition hover:bg-violet-500/20"
                    >
                      + {c.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="label">Así se verá en la bandeja de entrada</p>
                <div className="overflow-hidden rounded-xl border border-white/10 bg-white text-slate-900">
                  <div className="flex items-start gap-3 border-b border-slate-100 px-3.5 py-3">
                    <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-violet-600 text-xs font-bold text-white">
                      {(mailer.senderName || mailer.senderEmail || "T").slice(0, 1).toUpperCase()}
                    </span>
                    <div className="min-w-0 flex-1 text-xs">
                      <div className="flex justify-between gap-2">
                        <span className="truncate font-bold">
                          {mailer.senderName.split("|")[0].trim() || "Tu nombre"}
                        </span>
                        <span className="shrink-0 text-slate-400">9:41</span>
                      </div>
                      <p className="truncate font-semibold">{renderTemplate(subject, sample, previewExtras) || "(sin asunto)"}</p>
                      <p className="truncate text-slate-500">
                        {preheader.trim()
                          ? renderTemplate(preheader, sample, previewExtras)
                          : "Añade un texto de vista previa para aumentar la apertura…"}
                      </p>
                    </div>
                  </div>
                  <div className="space-y-2 px-3.5 py-3 opacity-40">
                    <div className="h-2 w-3/4 rounded bg-slate-200" />
                    <div className="h-2 w-1/2 rounded bg-slate-200" />
                  </div>
                </div>
              </div>
            </div>
            <Deliverability signals={signals} />
          </Section>

          {/* CONTENIDO */}
          <Section
            icon={LayoutTemplate}
            title="Contenido"
            done={checks.content}
            summary={`Plantilla: ${EMAIL_TEMPLATES.find((t) => t.id === templateId)?.name ?? "Personalizada"}`}
            collapsed={collapsed.content}
            onToggle={() => toggle("content")}
          >
            <TemplateEditor
              key={editorKey}
              subject={subject}
              onSubject={setSubject}
              body={body}
              onBody={setBody}
              templateId={templateId}
              onTemplateId={setTemplateId}
              sample={previewSample}
              preheader={preheader}
              hideSubject
              bare
            />
          </Section>

          {/* ENVÍO */}
          <Section
            icon={ShieldCheck}
            title="Envío"
            done={checks.delivery}
            summary={`Envío humano con pausas de ${delayMinSec}–${delayMaxSec} s · ${estimated}`}
            collapsed={collapsed.delivery}
            onToggle={() => toggle("delivery")}
          >
            <AntiSpam min={delayMinSec} max={delayMaxSec} onChange={setDelayRange} recipients={total} />
            <div className="mt-3">
              <Toggle
                checked={unsubscribe}
                onChange={setUnsubscribe}
                label="Incluir aviso para darse de baja (recomendado)"
                description="Añade al pie «responde BAJA» y la cabecera List-Unsubscribe. Lo exigen las leyes anti-spam y mejora la entregabilidad en Gmail y Yahoo."
              />
            </div>
          </Section>
        </div>

        <aside className="animate-fade-up space-y-4 xl:sticky xl:top-6 xl:self-start">
          <div className="card card-pad">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-white">Resumen de la campaña</h2>
              <span
                className={`badge ${ready ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" : "border-amber-500/30 text-amber-300"}`}
              >
                {ready ? "Lista" : "Incompleta"}
              </span>
            </div>
            <ul className="mt-4 space-y-2 text-xs">
              {(
                [
                  ["to", "Destinatarios"],
                  ["from", "Remitente"],
                  ["subject", "Asunto"],
                  ["content", "Contenido"],
                ] as [SectionId, string][]
              ).map(([id, label]) => (
                <li key={id} className="flex items-center gap-2">
                  {checks[id] ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                  ) : (
                    <Circle className="h-4 w-4 text-slate-600" />
                  )}
                  <span className={checks[id] ? "text-slate-300" : "text-slate-500"}>{label}</span>
                </li>
              ))}
            </ul>

            <dl className="mt-4 space-y-2 border-t border-white/[0.06] pt-4 text-xs">
              <Row label="Destinatarios">
                {total} destinatario{total === 1 ? "" : "s"} listado{total === 1 ? "" : "s"}
              </Row>
              <Row label="Tiempo estimado">{estimated}</Row>
              <Row label="Entregabilidad">
                <span className={warnings ? "text-amber-300" : "text-emerald-300"}>
                  {warnings ? `${warnings} aviso${warnings === 1 ? "" : "s"}` : "Sin avisos"}
                </span>
              </Row>
              {cap > 0 && (
                <Row label="Cuota de hoy">
                  <span className={overCap ? "text-amber-300" : "text-slate-200"}>
                    {today} + {total} / {cap}
                  </span>
                </Row>
              )}
            </dl>

            {mailer.mode === "simulated" && (
              <p className="mt-4 rounded-xl border border-sky-500/25 bg-sky-500/10 px-3 py-2 text-[11px] text-sky-200">
                Modo demostración: no se enviarán correos reales.
              </p>
            )}
            {overCap && (
              <p className="mt-3 flex items-start gap-2 rounded-xl border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-200">
                <Gauge className="mt-px h-3.5 w-3.5 shrink-0" />
                Superarás el límite diario recomendado para {mailerModeLabel(mailer.mode)}. Divide la campaña en
                varios días.
              </p>
            )}

            <div className="mt-5 space-y-2">
              <button type="button" onClick={startCampaign} disabled={total === 0} className="btn btn-success w-full py-3">
                <Send className="h-4 w-4" />
                Enviar Campaña
              </button>
              <button
                type="button"
                onClick={sendTemplateTest}
                disabled={testing}
                className="btn btn-secondary w-full"
                title="Envía esta plantilla, ya personalizada, a tu propio correo"
              >
                {testing ? <Spinner className="h-4 w-4" /> : <FlaskConical className="h-4 w-4" />}
                Enviarme una prueba
              </button>
            </div>
          </div>
        </aside>
      </div>

      <SuppressionManager open={suppressionOpen} onClose={() => setSuppressionOpen(false)} />

      <Modal
        open={dialog === "sender"}
        onClose={closeDialog}
        title="Ajustes del Remitente"
        description="Se guardan en este dispositivo y solo se configuran una vez."
        className="max-w-3xl"
      >
        <SenderSettings />
      </Modal>

      {phase !== "idle" && (
        <SendModal
          mode={phase === "confirm" ? "confirm" : phase === "sending" ? "sending" : "done"}
          total={total}
          subject={renderTemplate(subject, sample, previewExtras)}
          channel={mailerModeLabel(mailer.mode)}
          delayMinSec={delayMinSec}
          delayMaxSec={delayMaxSec}
          progress={progress}
          log={log}
          paused={paused}
          nextIn={nextIn}
          onConfirm={onConfirm}
          onCancel={onCancel}
          onTogglePause={onTogglePause}
          onClose={onClose}
        />
      )}
    </div>
  );
}

function Section({
  icon: Icon,
  title,
  done,
  summary,
  collapsed,
  onToggle,
  extra,
  children,
}: {
  icon: LucideIcon;
  title: string;
  done: boolean;
  summary: string;
  collapsed?: boolean;
  onToggle: () => void;
  extra?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="p-5 sm:p-6">
      <div className="flex items-start gap-4">
        <span
          className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
            done ? "bg-emerald-500/15 text-emerald-400" : "bg-white/[0.05] text-slate-500"
          }`}
        >
          {done ? <CheckCircle2 className="h-[18px] w-[18px]" /> : <Icon className="h-4 w-4" />}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold text-white">{title}</h2>
          <p className="mt-0.5 truncate text-xs text-slate-500">{summary}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {!collapsed && extra}
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={!collapsed}
            aria-label={collapsed ? `Editar ${title}` : `Contraer ${title}`}
            className="btn btn-sm btn-ghost"
          >
            {collapsed ? "Editar" : <ChevronDown className="h-4 w-4 rotate-180" />}
          </button>
        </div>
      </div>
      {!collapsed && <div className="animate-fade-in mt-5 sm:pl-12">{children}</div>}
    </section>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-slate-500">{label}</dt>
      <dd className="min-w-0 truncate text-right text-slate-200">{children}</dd>
    </div>
  );
}

function Deliverability({ signals }: { signals: ReturnType<typeof spamSignals> }) {
  if (signals.length === 0) {
    return (
      <p className="mt-4 flex items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.06] px-3 py-2 text-[11px] text-emerald-200">
        <ShieldCheck className="h-3.5 w-3.5" /> Revisión de entregabilidad: todo en orden.
      </p>
    );
  }
  return (
    <ul className="mt-4 space-y-1.5">
      {signals.map((s) => (
        <li
          key={s.text}
          className={`flex items-start gap-2 rounded-xl border px-3 py-2 text-[11px] ${
            s.level === "warn"
              ? "border-amber-500/20 bg-amber-500/[0.06] text-amber-200"
              : "border-sky-500/20 bg-sky-500/[0.05] text-sky-200"
          }`}
        >
          {s.level === "warn" ? <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" /> : <Info className="mt-px h-3.5 w-3.5 shrink-0" />}
          {s.text}
        </li>
      ))}
    </ul>
  );
}

function AntiSpam({
  min,
  max,
  onChange,
  recipients,
}: {
  min: number;
  max: number;
  onChange: (min: number, max: number) => void;
  recipients: number;
}) {
  const estimated = formatDuration(Math.max(0, recipients - 1) * averageDelaySec(min, max));

  return (
    <div className="rounded-2xl border border-white/[0.07] bg-white/[0.015] p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-white">Envío Humano Anti-Spam</h3>
          <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
            Los correos salen uno a uno con pausas aleatorias para proteger la reputación de tu dominio.
          </p>
        </div>
        <span className="chip tabular-nums">
          {min}–{max} s
        </span>
      </div>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <RangeField label="Pausa mínima" value={min} onChange={(v) => onChange(Math.min(v, max), max)} />
        <RangeField label="Pausa máxima" value={max} onChange={(v) => onChange(min, Math.max(v, min))} />
      </div>
      <p className="mt-3 text-[11px] text-slate-500">
        Tiempo estimado para {recipients} destinatario{recipients === 1 ? "" : "s"}:{" "}
        <span className="text-slate-300">{estimated}</span>
      </p>
    </div>
  );
}

function RangeField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between text-[11px] text-slate-500">
        <span>{label}</span>
        <span className="text-slate-300 tabular-nums">{value} s</span>
      </div>
      <input
        type="range"
        min={10}
        max={30}
        step={1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-violet-500"
        aria-label={`${label} entre envíos en segundos`}
      />
    </div>
  );
}
