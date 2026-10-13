"use client";

import type { ReactNode } from "react";
import { CheckCircle2, Info, X, XCircle, type LucideIcon } from "lucide-react";
import { useAppState, type ToastTone } from "./app-state";

export function Spinner({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={`${className} animate-spin`} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.4 0 0 5.4 0 12h4z" />
    </svg>
  );
}

const TOAST_STYLES: Record<ToastTone, { icon: LucideIcon; tone: string }> = {
  success: { icon: CheckCircle2, tone: "text-emerald-400" },
  error: { icon: XCircle, tone: "text-rose-400" },
  info: { icon: Info, tone: "text-sky-400" },
};

export function Toaster() {
  const { toasts, dismissToast } = useAppState();
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-20 z-[60] flex flex-col items-center gap-2 px-4 sm:bottom-6 sm:items-end sm:px-6"
    >
      {toasts.map((t) => {
        const { icon: Icon, tone } = TOAST_STYLES[t.tone];
        return (
          <div
            key={t.id}
            role={t.tone === "error" ? "alert" : "status"}
            className="animate-toast-in pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-2xl border border-white/10 bg-slate-900/90 p-4 shadow-2xl shadow-black/50 backdrop-blur-xl"
          >
            <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${tone}`} aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-slate-100">{t.title}</p>
              {t.description && <p className="mt-0.5 text-xs leading-relaxed text-slate-400">{t.description}</p>}
            </div>
            <button
              type="button"
              onClick={() => dismissToast(t.id)}
              aria-label="Cerrar notificación"
              className="rounded-md p-1 text-slate-500 transition hover:bg-white/10 hover:text-slate-200"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="animate-fade-up flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-white sm:text-[28px]">{title}</h1>
        {description && <p className="mt-1.5 max-w-2xl text-sm text-slate-400">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function StatCard({
  icon: Icon,
  label,
  value,
  hint,
  accent = "violet",
}: {
  icon: LucideIcon;
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  accent?: "violet" | "emerald" | "sky" | "amber" | "rose";
}) {
  const accents = {
    violet: "from-violet-500/20 text-violet-300 ring-violet-400/20",
    emerald: "from-emerald-500/20 text-emerald-300 ring-emerald-400/20",
    sky: "from-sky-500/20 text-sky-300 ring-sky-400/20",
    amber: "from-amber-500/20 text-amber-300 ring-amber-400/20",
    rose: "from-rose-500/20 text-rose-300 ring-rose-400/20",
  } as const;
  return (
    <div className="card card-pad relative overflow-hidden">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium text-slate-400">{label}</p>
          <p className="mt-2 text-2xl font-semibold tracking-tight text-white tabular-nums">{value}</p>
          {hint && <p className="mt-1 text-[11px] text-slate-500">{hint}</p>}
        </div>
        <span
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br to-transparent ring-1 ${accents[accent]}`}
        >
          <Icon className="h-5 w-5" aria-hidden="true" />
        </span>
      </div>
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-gradient-to-br from-violet-500/15 to-cyan-400/5 text-violet-300">
        <Icon className="h-6 w-6" aria-hidden="true" />
      </span>
      <p className="mt-4 text-sm font-semibold text-slate-100">{title}</p>
      {description && <p className="mt-1 max-w-sm text-xs leading-relaxed text-slate-500">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex w-full items-start gap-3 rounded-xl border border-white/[0.07] bg-white/[0.02] px-3.5 py-3 text-left transition hover:border-white/15 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-violet-500/20"
    >
      <span
        aria-hidden="true"
        className={`relative mt-0.5 inline-flex h-5 w-9 shrink-0 items-center rounded-full transition ${
          checked ? "bg-violet-500" : "bg-slate-700"
        }`}
      >
        <span
          className={`inline-block h-4 w-4 rounded-full bg-white shadow transition ${
            checked ? "translate-x-[18px]" : "translate-x-0.5"
          }`}
        />
      </span>
      <span className="min-w-0">
        <span className="block text-xs font-semibold text-slate-200">{label}</span>
        {description && <span className="mt-0.5 block text-[11px] leading-snug text-slate-500">{description}</span>}
      </span>
    </button>
  );
}
