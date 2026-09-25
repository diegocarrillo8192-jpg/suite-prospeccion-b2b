"use client";

import { useRef, useState, useSyncExternalStore } from "react";
import { useAppState } from "./app-state";
import { RecipientList } from "./recipient-list";
import { TemplateEditor } from "./template-editor";
import { SenderSettings } from "./sender-settings";
import { SendModal } from "./send-monitor-modal";
import { Modal } from "./modal";
import { renderTemplate, senderExtras } from "@/lib/template";
import { EMAIL_TEMPLATES } from "@/lib/email-templates";
import {
  averageDelaySec,
  getMailerSnapshot,
  getServerMailerSnapshot,
  isMailerConfigured,
  providerConfigFrom,
  randomDelaySec,
  subscribeMailer,
  updateMailerConfig,
  type MailerConfig,
} from "@/lib/mailer";
import { formatDuration } from "@/lib/format";
import type { Prospect, SendStatus } from "@/lib/types";

type Phase = "idle" | "confirm" | "sending" | "done";

const DEFAULT_TEMPLATE = EMAIL_TEMPLATES[0];
const IS_TEST = process.env.NODE_ENV === "test";

async function sendEmail(r: Prospect, subject: string, body: string): Promise<boolean> {
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
        body: renderTemplate(body, r, extras),
      }),
    });
    if (!res.ok) return false;
    const data = await res.json();
    return data?.success === true;
  } catch {
    return false;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function EmailSender() {
  const { recipients, clearRecipients } = useAppState();
  const [subject, setSubject] = useState(DEFAULT_TEMPLATE.subject);
  const [body, setBody] = useState(DEFAULT_TEMPLATE.html);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState<SendStatus>({
    total: 0,
    sent: 0,
    failed: 0,
    pending: 0,
    current: 0,
  });
  const cancelRef = useRef(false);

  const mailer = useSyncExternalStore(
    subscribeMailer,
    getMailerSnapshot,
    getServerMailerSnapshot
  );
  const configured = isMailerConfigured(mailer);
  const delayMinSec = mailer.delayMinSec;
  const delayMaxSec = mailer.delayMaxSec;

  const total = recipients.length;
  const estimated = formatDuration(total * averageDelaySec(delayMinSec, delayMaxSec));

  function setDelayRange(min: number, max: number) {
    const next: Partial<MailerConfig> = { delayMinSec: min, delayMaxSec: max };
    updateMailerConfig(next);
  }

  function nextDelaySec(): number {
    if (IS_TEST) return 0;
    return randomDelaySec(delayMinSec, delayMaxSec);
  }

  async function onConfirm() {
    if (phase === "sending") return;
    cancelRef.current = false;
    setPhase("sending");

    const list = recipients;
    setProgress({ total: list.length, sent: 0, failed: 0, pending: list.length, current: 0 });

    for (let i = 0; i < list.length; i++) {
      if (cancelRef.current) break;
      const r = list[i];
      setProgress((p) => ({ ...p, current: i + 1, pending: Math.max(0, p.pending - 1) }));
      const ok = await sendEmail(r, subject, body);
      setProgress((p) => (ok ? { ...p, sent: p.sent + 1 } : { ...p, failed: p.failed + 1 }));
      if (i < list.length - 1) await sleep(nextDelaySec() * 1000);
    }

    setPhase("done");
  }

  function onCancel() {
    cancelRef.current = true;
  }

  function onClose() {
    setPhase("idle");
    setProgress({ total: 0, sent: 0, failed: 0, pending: 0, current: 0 });
  }

  return (
    <div className="space-y-6">
      <div className="animate-fade-up flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-100">Envío Rápido</h2>
          <p className="mt-1 text-sm text-slate-400">
            Carga tu CSV, elige una plantilla y envía la campaña con pausas humanas.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setSettingsOpen(true)}
          className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-medium text-slate-200 transition hover:bg-white/10"
        >
          <span
            className={`h-2 w-2 rounded-full ${
              configured ? "bg-emerald-400" : "bg-amber-400"
            }`}
          />
          Ajustes del Remitente
        </button>
      </div>

      <div className="animate-fade-up rounded-2xl border border-white/10 bg-white/[0.03] p-6 shadow-xl shadow-black/20 backdrop-blur-xl">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-100">Destinatarios</h3>
          {total > 0 && (
            <button
              onClick={clearRecipients}
              className="rounded-lg px-3 py-1.5 text-xs font-medium text-slate-400 transition hover:bg-white/10 hover:text-slate-200"
            >
              Limpiar lista
            </button>
          )}
        </div>
        <div className="mt-4">
          <RecipientList />
        </div>
      </div>

      <div className="animate-fade-up">
        <TemplateEditor subject={subject} onSubject={setSubject} body={body} onBody={setBody} />
      </div>

      <div className="animate-fade-up flex flex-col gap-4 rounded-2xl border border-white/10 bg-white/[0.03] p-6 shadow-xl shadow-black/20 backdrop-blur-xl sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm text-slate-400">
          <p>
            {total} destinatario{total === 1 ? "" : "s"} listado{total === 1 ? "" : "s"}
          </p>
          <p className="text-xs text-slate-600">
            Pausa humana aleatoria: {delayMinSec}–{delayMaxSec} s · Tiempo estimado: {estimated}
          </p>
        </div>
        <button
          onClick={() => setPhase("confirm")}
          disabled={total === 0}
          className="rounded-xl bg-emerald-500 px-8 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-500/20 transition hover:bg-emerald-400 disabled:opacity-50"
        >
          Enviar Campaña
        </button>
      </div>

      <Modal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        title="Ajustes del Remitente"
        description="Se guardan en este dispositivo y solo se configuran una vez."
        className="max-w-2xl"
      >
        <div className="space-y-5">
          <SenderSettings />
          <AntiSpam
            min={delayMinSec}
            max={delayMaxSec}
            onChange={setDelayRange}
            recipients={total}
          />
        </div>
      </Modal>

      {phase !== "idle" && (
        <SendModal
          mode={phase === "confirm" ? "confirm" : phase === "sending" ? "sending" : "done"}
          total={total}
          delayMinSec={delayMinSec}
          delayMaxSec={delayMaxSec}
          progress={progress}
          onConfirm={onConfirm}
          onCancel={onCancel}
          onClose={onClose}
        />
      )}
    </div>
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
  const estimated = formatDuration(recipients * averageDelaySec(min, max));

  function setMin(value: number) {
    onChange(Math.min(value, max), max);
  }

  function setMax(value: number) {
    onChange(min, Math.max(value, min));
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 shadow-xl shadow-black/20 backdrop-blur-xl">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-100">Envío Humano Anti-Spam</h3>
          <p className="mt-1 text-xs text-slate-500">
            Pausas aleatorias entre envíos para proteger la reputación del dominio.
          </p>
        </div>
        <span className="shrink-0 rounded-lg border border-slate-700 bg-slate-900/60 px-3 py-1.5 text-center text-xs text-slate-200">
          {min}–{max} s
        </span>
      </div>

      <div className="mt-4 space-y-4">
        <div>
          <div className="mb-1.5 flex items-center justify-between text-[11px] text-slate-500">
            <span>Pausa mínima</span>
            <span>{min} s</span>
          </div>
          <input
            type="range"
            min={10}
            max={30}
            step={1}
            value={min}
            onChange={(e) => setMin(Number(e.target.value))}
            className="w-full accent-emerald-500"
            aria-label="Pausa mínima entre envíos en segundos"
          />
        </div>
        <div>
          <div className="mb-1.5 flex items-center justify-between text-[11px] text-slate-500">
            <span>Pausa máxima</span>
            <span>{max} s</span>
          </div>
          <input
            type="range"
            min={10}
            max={30}
            step={1}
            value={max}
            onChange={(e) => setMax(Number(e.target.value))}
            className="w-full accent-emerald-500"
            aria-label="Pausa máxima entre envíos en segundos"
          />
        </div>
      </div>

      <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
        Cada correo espera un tiempo distinto dentro del rango para simular comportamiento
        humano. Tiempo estimado para {recipients} destinatario{recipients === 1 ? "" : "s"}:{" "}
        <span className="text-slate-300">{estimated}</span>.
      </p>
    </div>
  );
}
