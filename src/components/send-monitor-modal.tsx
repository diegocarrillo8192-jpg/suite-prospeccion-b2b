"use client";

import { useEffect, useRef } from "react";
import { formatDuration } from "@/lib/format";
import type { SendStatus } from "@/lib/types";

interface Props {
  mode: "confirm" | "sending" | "done";
  total: number;
  delaySec: number;
  progress: SendStatus;
  onConfirm: () => void;
  onCancel: () => void;
  onClose: () => void;
}

export function SendModal({
  mode,
  total,
  delaySec,
  progress,
  onConfirm,
  onCancel,
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

  const pct =
    progress.total > 0 ? Math.round(((progress.sent + progress.failed) / progress.total) * 100) : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm">
      <div className="animate-pop-in w-full max-w-md rounded-2xl border border-white/10 bg-slate-900/80 p-6 shadow-xl shadow-black/50 backdrop-blur-xl">
        {mode === "confirm" && (
          <>
            <h3 className="text-lg font-semibold text-slate-100">Confirmar envío</h3>
            <div className="mt-4 space-y-2 text-sm">
              <Row label="Destinatarios" value={String(total)} />
              <Row label="Retraso entre envíos" value={`${delaySec} s`} />
              <Row label="Tiempo estimado" value={formatDuration(total * delaySec)} />
            </div>
            <p className="mt-4 rounded-lg bg-slate-900/60 p-3 text-xs text-slate-500">
              Los correos se enviarán de forma secuencial con los retardos configurados para
              minimizar la detección de spam.
            </p>
            <div className="mt-6 flex gap-3">
              <button
                onClick={onClose}
                className="flex-1 rounded-xl border border-slate-700 px-4 py-2.5 text-sm font-medium text-slate-300 transition hover:bg-slate-800"
              >
                Cancelar
              </button>
              <button
                onClick={onConfirm}
                className="flex-1 rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-400"
              >
                Iniciar envío
              </button>
            </div>
          </>
        )}

        {mode === "sending" && (
          <>
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-100">Enviando…</h3>
              <button
                onClick={onCancel}
                className="rounded-lg px-3 py-1.5 text-xs font-medium text-slate-400 transition hover:bg-slate-800 hover:text-slate-200"
              >
                Detener
              </button>
            </div>
            <div className="mt-5">
              <div className="mb-1.5 flex justify-between text-xs text-slate-400">
                <span>{pct}%</span>
                <span>
                  {progress.current} / {progress.total}
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-slate-800">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-sky-500 transition-[width] duration-300"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
            <div className="mt-5 grid grid-cols-3 gap-3 text-center">
              <Stat label="Enviados" value={progress.sent} color="text-emerald-400" />
              <Stat label="Pendientes" value={progress.pending} color="text-slate-300" />
              <Stat label="Fallidos" value={progress.failed} color="text-rose-400" />
            </div>
          </>
        )}

        {mode === "done" && (
          <>
            <h3 className="text-lg font-semibold text-slate-100">Envío finalizado</h3>
            <div className="mt-4 grid grid-cols-3 gap-3 text-center">
              <Stat label="Enviados" value={progress.sent} color="text-emerald-400" />
              <Stat label="Pendientes" value={progress.pending} color="text-slate-300" />
              <Stat label="Fallidos" value={progress.failed} color="text-rose-400" />
            </div>
            <div className="mt-6">
              <button
                onClick={onClose}
                className="w-full rounded-xl bg-slate-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-600"
              >
                Cerrar
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-slate-500">{label}</span>
      <span className="font-medium text-slate-100">{value}</span>
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-3 shadow-lg shadow-black/20">
      <p className={`text-2xl font-semibold ${color}`}>{value}</p>
      <p className="mt-0.5 text-xs text-slate-500">{label}</p>
    </div>
  );
}
