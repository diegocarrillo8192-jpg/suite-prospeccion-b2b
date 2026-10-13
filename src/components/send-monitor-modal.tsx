"use client";

import { useEffect, useRef } from "react";
import { CheckCircle2, Pause, Play, Send, Square, XCircle } from "lucide-react";
import { formatDuration } from "@/lib/format";
import { averageDelaySec } from "@/lib/email-providers";
import type { SendStatus } from "@/lib/types";

export interface SendLogEntry {
  email: string;
  empresa: string;
  ok: boolean;
  message?: string;
}

interface Props {
  mode: "confirm" | "sending" | "done";
  total: number;
  subject: string;
  channel: string;
  delayMinSec: number;
  delayMaxSec: number;
  progress: SendStatus;
  log: SendLogEntry[];
  paused: boolean;
  nextIn: number;
  onConfirm: () => void;
  onCancel: () => void;
  onTogglePause: () => void;
  onClose: () => void;
}

export function SendModal({
  mode,
  total,
  subject,
  channel,
  delayMinSec,
  delayMaxSec,
  progress,
  log,
  paused,
  nextIn,
  onConfirm,
  onCancel,
  onTogglePause,
  onClose,
}: Props) {
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && mode !== "sending") onCloseRef.current();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mode]);

  // Evita cerrar la pestaña por accidente durante un envío.
  useEffect(() => {
    if (mode !== "sending") return;
    function onBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault();
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [mode]);

  const processed = progress.sent + progress.failed;
  const pct = progress.total > 0 ? Math.round((processed / progress.total) * 100) : 0;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Monitor de envío"
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#03050a]/75 p-4 backdrop-blur-md"
    >
      <div className="animate-pop-in w-full max-w-lg rounded-3xl border border-white/10 bg-[#0b0f1a]/95 p-6 shadow-2xl shadow-black/60 backdrop-blur-2xl">
        {mode === "confirm" && (
          <>
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-500/15 text-emerald-300">
                <Send className="h-5 w-5" />
              </span>
              <h3 className="text-lg font-semibold text-white">Confirmar envío</h3>
            </div>
            <div className="mt-5 space-y-2.5 rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4 text-sm">
              <Row label="Asunto" value={subject} />
              <Row label="Canal" value={channel} />
              <Row label="Destinatarios" value={String(total)} />
              <Row label="Pausa aleatoria" value={`${delayMinSec}–${delayMaxSec} s`} />
              <Row
                label="Tiempo estimado"
                value={formatDuration(Math.max(0, total - 1) * averageDelaySec(delayMinSec, delayMaxSec))}
              />
            </div>
            <p className="mt-4 text-xs leading-relaxed text-slate-500">
              Los correos se envían uno a uno con pausas aleatorias para simular comportamiento humano.
              Mantén esta pestaña abierta hasta que termine; puedes pausar o detener en cualquier momento.
            </p>
            <div className="mt-6 flex gap-3">
              <button type="button" onClick={onClose} className="btn btn-secondary flex-1">
                Cancelar
              </button>
              <button type="button" onClick={onConfirm} className="btn btn-success flex-1">
                Iniciar envío
              </button>
            </div>
          </>
        )}

        {mode === "sending" && (
          <>
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-white">{paused ? "En pausa" : "Enviando…"}</h3>
                <p className="mt-0.5 text-xs text-slate-500">
                  {paused
                    ? "La campaña continuará al reanudar."
                    : nextIn > 0
                      ? `Próximo envío en ${nextIn} s`
                      : `Enviando correo ${progress.current} de ${progress.total}`}
                </p>
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={onTogglePause} className="btn btn-sm btn-secondary">
                  {paused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
                  {paused ? "Reanudar" : "Pausar"}
                </button>
                <button type="button" onClick={onCancel} className="btn btn-sm btn-danger">
                  <Square className="h-3 w-3" /> Detener
                </button>
              </div>
            </div>
            <div className="mt-5">
              <div className="mb-1.5 flex justify-between text-xs text-slate-400 tabular-nums">
                <span>{pct}%</span>
                <span>
                  {processed} / {progress.total}
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-white/[0.06]">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-emerald-500 via-teal-400 to-cyan-400 transition-[width] duration-300"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
            <Stats progress={progress} />
            <LogList log={log} />
          </>
        )}

        {mode === "done" && (
          <>
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-500/15 text-emerald-300">
                <CheckCircle2 className="h-5 w-5" />
              </span>
              <div>
                <h3 className="text-lg font-semibold text-white">Envío finalizado</h3>
                <p className="text-xs text-slate-500">El resultado quedó guardado en el historial del Panel.</p>
              </div>
            </div>
            <Stats progress={progress} />
            <LogList log={log} />
            <div className="mt-6">
              <button type="button" onClick={onClose} className="btn btn-secondary w-full">
                Cerrar
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Stats({ progress }: { progress: SendStatus }) {
  return (
    <div className="mt-5 grid grid-cols-3 gap-3 text-center">
      <Stat label="Enviados" value={progress.sent} color="text-emerald-400" />
      <Stat label="Pendientes" value={progress.pending} color="text-slate-300" />
      <Stat label="Fallidos" value={progress.failed} color="text-rose-400" />
    </div>
  );
}

function LogList({ log }: { log: SendLogEntry[] }) {
  if (log.length === 0) return null;
  return (
    <ul className="mt-4 max-h-48 space-y-1 overflow-y-auto pr-1" aria-label="Registro de envío">
      {log.map((entry, i) => (
        <li key={`${entry.email}-${i}`} className="flex items-start gap-2 rounded-lg bg-white/[0.02] px-3 py-2 text-xs">
          {entry.ok ? (
            <CheckCircle2 className="mt-px h-3.5 w-3.5 shrink-0 text-emerald-400" />
          ) : (
            <XCircle className="mt-px h-3.5 w-3.5 shrink-0 text-rose-400" />
          )}
          <span className="min-w-0">
            <span className="block truncate text-slate-300">{entry.email}</span>
            {!entry.ok && entry.message && <span className="block text-[11px] text-rose-300/80">{entry.message}</span>}
          </span>
        </li>
      ))}
    </ul>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="shrink-0 text-slate-500">{label}</span>
      <span className="truncate font-medium text-slate-100">{value}</span>
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] px-3 py-3">
      <p className={`text-2xl font-semibold tabular-nums ${color}`}>{value}</p>
      <p className="mt-0.5 text-xs text-slate-500">{label}</p>
    </div>
  );
}
