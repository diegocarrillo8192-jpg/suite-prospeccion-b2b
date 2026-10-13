"use client";

import { useSyncExternalStore } from "react";
import {
  BookOpen,
  Gauge,
  LayoutDashboard,
  PlugZap,
  Mail,
  Search,
  Send,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import { Logo } from "./logo";
import { useAppState } from "./app-state";
import {
  engineLabel,
  getProvidersSnapshot,
  getServerProvidersSnapshot,
  subscribeProviders,
} from "@/lib/providers";
import {
  getMailerSnapshot,
  getServerMailerSnapshot,
  isMailerConfigured,
  mailerModeLabel,
  subscribeMailer,
} from "@/lib/mailer";
import { DAILY_LIMITS, sentToday } from "@/lib/email-providers";
import type { TabId } from "@/lib/types";

interface NavItem {
  id: TabId;
  label: string;
  short: string;
  icon: LucideIcon;
}

const NAV: NavItem[] = [
  { id: "dashboard", label: "Panel", short: "Panel", icon: LayoutDashboard },
  { id: "search", label: "Buscador de Prospectos", short: "Buscador", icon: Search },
  { id: "sender", label: "Emisor de Correos", short: "Campañas", icon: Send },
  { id: "connectors", label: "Conectores", short: "Conectores", icon: PlugZap },
  { id: "guide", label: "Manual de uso", short: "Manual", icon: BookOpen },
];

function useStatus() {
  const providers = useSyncExternalStore(subscribeProviders, getProvidersSnapshot, getServerProvidersSnapshot);
  const mailer = useSyncExternalStore(subscribeMailer, getMailerSnapshot, getServerMailerSnapshot);
  return {
    engine: engineLabel(providers.engine),
    mailerReady: isMailerConfigured(mailer),
    mailerLabel: mailerModeLabel(mailer.mode),
  };
}

export function Sidebar() {
  const { tab, setTab, prospects, recipients } = useAppState();
  const status = useStatus();
  const counts: Partial<Record<TabId, number>> = {
    search: prospects.length,
    sender: recipients.length,
  };

  return (
    <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-white/[0.06] bg-[#070a12]/70 px-4 py-5 backdrop-blur-xl lg:flex">
      <div className="flex items-center gap-3 px-2">
        <Logo size={36} />
        <div className="leading-tight">
          <p className="text-sm font-semibold text-white">Suite de Prospección</p>
          <p className="text-[11px] font-medium text-violet-300/80">B2B · Leads &amp; Email</p>
        </div>
      </div>

      <nav aria-label="Secciones" className="mt-8 space-y-1">
        <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-600">
          Espacio de trabajo
        </p>
        {NAV.map((item) => {
          const active = tab === item.id;
          const Icon = item.icon;
          const count = counts[item.id];
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              aria-current={active ? "page" : undefined}
              className={`group relative flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                active
                  ? "bg-gradient-to-r from-violet-500/20 to-indigo-500/5 text-white ring-1 ring-violet-400/25"
                  : "text-slate-400 hover:bg-white/[0.04] hover:text-slate-100"
              }`}
            >
              {active && (
                <span className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-gradient-to-b from-violet-400 to-cyan-300" />
              )}
              <Icon className={`h-4 w-4 ${active ? "text-violet-300" : "text-slate-500 group-hover:text-slate-300"}`} />
              <span className="flex-1 text-left">{item.label}</span>
              {item.id === "connectors" && (
                <span
                  title={status.mailerReady ? "Remitente listo" : "Falta configurar el remitente"}
                  className={`h-2 w-2 rounded-full ${status.mailerReady ? "bg-emerald-400" : "bg-amber-400"}`}
                />
              )}
              {count ? (
                <span className="rounded-full bg-white/[0.08] px-2 py-0.5 text-[10px] font-semibold tabular-nums text-slate-300">
                  {count}
                </span>
              ) : null}
            </button>
          );
        })}
      </nav>

      <DailyQuota />

      <div className="mt-auto rounded-2xl border border-white/[0.07] bg-gradient-to-br from-violet-500/10 via-transparent to-cyan-400/5 p-4">
        <div className="flex items-center gap-2 text-xs font-semibold text-slate-200">
          <ShieldCheck className="h-4 w-4 text-emerald-400" />
          Datos privados
        </div>
        <p className="mt-1.5 text-[11px] leading-relaxed text-slate-500">
          Tus prospectos, campañas y claves se guardan solo en este navegador.
        </p>
      </div>
    </aside>
  );
}

/** Envíos de hoy frente al límite diario recomendado del canal. */
function DailyQuota() {
  const { campaigns, setTab } = useAppState();
  const mailer = useSyncExternalStore(subscribeMailer, getMailerSnapshot, getServerMailerSnapshot);
  const sent = sentToday(campaigns);
  const cap = DAILY_LIMITS[mailer.mode];
  const pct = cap ? Math.min(100, Math.round((sent / cap) * 100)) : 0;
  return (
    <button
      type="button"
      onClick={() => setTab("connectors")}
      className="mt-8 rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4 text-left transition hover:border-white/15"
    >
      <div className="flex items-center justify-between text-xs">
        <span className="flex items-center gap-2 font-semibold text-slate-200">
          <Gauge className="h-4 w-4 text-violet-300" /> Envíos de hoy
        </span>
        <span className="text-slate-400 tabular-nums">
          {sent}
          {cap ? ` / ${cap}` : ""}
        </span>
      </div>
      {cap ? (
        <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
          <div
            className={`h-full rounded-full ${pct > 85 ? "bg-rose-400" : pct > 60 ? "bg-amber-400" : "bg-gradient-to-r from-violet-500 to-cyan-400"}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      ) : null}
      <p className="mt-2 text-[11px] leading-snug text-slate-500">
        {cap
          ? `Límite recomendado para ${mailerModeLabel(mailer.mode)}. Respetarlo protege tu reputación.`
          : "Modo demostración: sin límite diario."}
      </p>
    </button>
  );
}

/** Barra superior y navegación inferior para pantallas pequeñas. */
export function MobileNav() {
  const { tab, setTab, openDialog, prospects, recipients } = useAppState();
  const counts: Partial<Record<TabId, number>> = { search: prospects.length, sender: recipients.length };
  return (
    <>
      <header className="sticky top-0 z-40 flex items-center justify-between border-b border-white/[0.06] bg-[#05070d]/85 px-4 py-3 backdrop-blur-xl lg:hidden">
        <div className="flex items-center gap-2.5">
          <Logo size={30} />
          <p className="text-sm font-semibold text-white">Suite de Prospección B2B</p>
        </div>
        <button
          type="button"
          onClick={() => {
            setTab("sender");
            openDialog("sender");
          }}
          aria-label="Ajustes del Remitente"
          className="rounded-xl border border-white/10 bg-white/[0.04] p-2 text-slate-300 transition hover:bg-white/10"
        >
          <Mail className="h-4 w-4" />
        </button>
      </header>
      <nav
        aria-label="Secciones"
        className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-white/[0.08] bg-[#070a12]/95 px-2 pt-1.5 pb-[max(0.375rem,env(safe-area-inset-bottom))] backdrop-blur-xl lg:hidden"
      >
        {NAV.map((item) => {
          const active = tab === item.id;
          const Icon = item.icon;
          const count = counts[item.id];
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              aria-current={active ? "page" : undefined}
              className={`relative flex flex-col items-center gap-1 rounded-xl py-1.5 text-[10px] font-medium transition ${
                active ? "text-white" : "text-slate-500"
              }`}
            >
              <span
                className={`flex h-8 w-11 items-center justify-center rounded-full transition ${
                  active ? "bg-violet-500/20 text-violet-300" : ""
                }`}
              >
                <Icon className="h-[18px] w-[18px]" />
              </span>
              {item.short}
              {count ? (
                <span className="absolute top-0.5 right-[calc(50%-26px)] rounded-full bg-violet-500 px-1.5 text-[9px] font-bold text-white">
                  {count}
                </span>
              ) : null}
            </button>
          );
        })}
      </nav>
    </>
  );
}
