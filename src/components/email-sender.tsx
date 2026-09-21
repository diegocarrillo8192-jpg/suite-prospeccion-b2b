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
  getMailerSnapshot,
  getServerMailerSnapshot,
  isMailerConfigured,
  subscribeMailer,
} from "@/lib/mailer";
import { formatDuration } from "@/lib/format";
import type { Prospect, SendStatus } from "@/lib/types";

type Phase = "idle" | "confirm" | "sending" | "done";

const DEFAULT_TEMPLATE = EMAIL_TEMPLATES[0];

async function sendEmail(r: Prospect, subject: string, body: string): Promise<boolean> {
  try {
    const mailer = getMailerSnapshot();
    const extras = senderExtras(mailer);
    const res = await fetch("/api/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        to: r.correo,
        subject: renderTemplate(subject, r, extras),
        body: renderTemplate(body, r, extras),
        senderName: mailer.senderName,
        senderEmail: mailer.senderEmail,
        replyTo: mailer.replyTo || mailer.senderEmail,
        mode: mailer.mode,
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
  const [delaySec, setDelaySec] = useState(3);
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

  const total = recipients.length;
  const estimated = formatDuration(total * delaySec);

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
      if (i < list.length - 1) await sleep(delaySec * 1000);
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
            Carga tu CSV, elige una plantilla y envía la campaña.
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
            Intervalo anti-spam: {delaySec} s · Tiempo estimado: {estimated}
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
          <AntiSpam delaySec={delaySec} onDelay={setDelaySec} />
        </div>
      </Modal>

      {phase !== "idle" && (
        <SendModal
          mode={phase === "confirm" ? "confirm" : phase === "sending" ? "sending" : "done"}
          total={total}
          delaySec={delaySec}
          progress={progress}
          onConfirm={onConfirm}
          onCancel={onCancel}
          onClose={onClose}
        />
      )}
    </div>
  );
}

function AntiSpam({ delaySec, onDelay }: { delaySec: number; onDelay: (n: number) => void }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 shadow-xl shadow-black/20 backdrop-blur-xl">
      <h3 className="text-sm font-semibold text-slate-100">Ajustes Anti-Spam</h3>
      <p className="mt-1 text-xs text-slate-500">
        Retraso entre envíos para evitar ser marcado como spam.
      </p>
      <div className="mt-4 flex items-center gap-4">
        <input
          type="range"
          min={3}
          max={5}
          step={1}
          value={delaySec}
          onChange={(e) => onDelay(Number(e.target.value))}
          className="flex-1 accent-emerald-500"
          aria-label="Retraso entre envíos en segundos"
        />
        <span className="w-24 rounded-lg border border-slate-700 bg-slate-900/60 px-3 py-1.5 text-center text-sm text-slate-200">
          {delaySec} s
        </span>
      </div>
      <div className="mt-2 flex justify-between text-[11px] text-slate-600">
        <span>3 s (rápido)</span>
        <span>4 s (equilibrado)</span>
        <span>5 s (prudente)</span>
      </div>
    </div>
  );
}
