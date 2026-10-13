"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import {
  ArrowRight,
  AtSign,
  CheckCircle2,
  Circle,
  Clock,
  Globe,
  History,
  MailCheck,
  Search,
  Send,
  Sparkles,
  Trash2,
  Users,
} from "lucide-react";
import { hasValidEmail, useAppState } from "./app-state";
import { EmptyState, PageHeader, StatCard } from "./ui";
import { Modal } from "./modal";
import {
  getMailerSnapshot,
  getServerMailerSnapshot,
  isMailerConfigured,
  subscribeMailer,
} from "@/lib/mailer";
import { getHistoryCount, getServerHistoryCount, subscribeHistory } from "@/lib/duplicates";
import type { CampaignRecord } from "@/lib/types";

function pct(part: number, total: number): number {
  return total > 0 ? Math.round((part / total) * 100) : 0;
}

function formatDate(ts: number): string {
  try {
    return new Intl.DateTimeFormat("es", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(ts));
  } catch {
    return new Date(ts).toLocaleString();
  }
}

export function Dashboard() {
  const {
    prospects,
    recipients,
    campaigns,
    recentSearches,
    setTab,
    openDialog,
    setSearchDraft,
    clearCampaigns,
    contactedEmails,
  } = useAppState();
  const mailer = useSyncExternalStore(subscribeMailer, getMailerSnapshot, getServerMailerSnapshot);
  const historyCount = useSyncExternalStore(subscribeHistory, getHistoryCount, getServerHistoryCount);
  const [openCampaign, setOpenCampaign] = useState<CampaignRecord | null>(null);

  const stats = useMemo(() => {
    const withWebsite = prospects.filter((p) => p.website).length;
    const withEmail = prospects.filter(hasValidEmail).length;
    const valid = prospects.filter((p) => p.emailStatus === "valid").length;
    const withPhone = prospects.filter((p) => p.whatsapp).length;
    const contacted = prospects.filter((p) => contactedEmails.has((p.correo ?? "").toLowerCase())).length;
    const hot = prospects.filter((p) => p.webOpportunity?.level === "alta").length;
    const real = campaigns.filter((c) => c.mode !== "simulated");
    const sent = real.reduce((acc, c) => acc + c.sent, 0);
    const failed = real.reduce((acc, c) => acc + c.failed, 0);
    return { withWebsite, withEmail, valid, withPhone, contacted, hot, sent, failed, realCampaigns: real.length };
  }, [prospects, campaigns, contactedEmails]);

  const mailerReady = isMailerConfigured(mailer);
  const steps = [
    {
      done: mailerReady,
      title: "Configura tu remitente",
      text: "Gmail, SMTP, Resend o SendGrid. Prueba la conexión antes de enviar.",
      action: () => {
        setTab("sender");
        openDialog("sender");
      },
      cta: "Configurar",
    },
    {
      done: prospects.length > 0 || historyCount > 0,
      title: "Busca tus primeros prospectos",
      text: "Elige nicho y ciudad de cualquier país. Modo gratis sin API Keys.",
      action: () => setTab("search"),
      cta: "Buscar",
    },
    {
      done: prospects.some((p) => p.enriched),
      title: "Enriquece y valida correos",
      text: "Extrae correos, redes y stack web; valida MX antes de enviar.",
      action: () => setTab("search"),
      cta: "Ir a resultados",
    },
    {
      done: campaigns.length > 0,
      title: "Lanza tu primera campaña",
      text: "Plantillas personalizables y envío con pausas humanas anti-spam.",
      action: () => setTab("sender"),
      cta: "Crear campaña",
    },
  ];
  const completed = steps.filter((s) => s.done).length;

  const funnel = [
    { label: "Prospectos encontrados", value: prospects.length, color: "from-violet-500 to-indigo-500" },
    { label: "Con sitio web", value: stats.withWebsite, color: "from-indigo-500 to-sky-500" },
    { label: "Con correo", value: stats.withEmail, color: "from-sky-500 to-cyan-400" },
    { label: "Correo validado", value: stats.valid, color: "from-cyan-400 to-emerald-400" },
    { label: "Contactados", value: stats.contacted, color: "from-emerald-400 to-emerald-500" },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Panel de control"
        title="Tu pipeline de prospección"
        description="Resumen de tus prospectos, correos y campañas. Todo se guarda en este navegador."
        actions={
          <>
            <button type="button" onClick={() => setTab("sender")} className="btn btn-secondary">
              <Send className="h-4 w-4" /> Nueva campaña
            </button>
            <button type="button" onClick={() => setTab("search")} className="btn btn-primary">
              <Search className="h-4 w-4" /> Nueva búsqueda
            </button>
          </>
        }
      />

      <div className="animate-fade-up grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard icon={Users} label="Prospectos en lista" value={prospects.length} hint={`${historyCount} empresas en historial`} />
        <StatCard
          icon={AtSign}
          label="Con correo"
          value={stats.withEmail}
          hint={`${pct(stats.withEmail, prospects.length)}% de la lista`}
          accent="sky"
        />
        <StatCard
          icon={MailCheck}
          label="Correos enviados"
          value={stats.sent}
          hint={
            stats.sent + stats.failed > 0
              ? `${pct(stats.sent, stats.sent + stats.failed)}% de entrega`
              : "Sin envíos reales aún"
          }
          accent="emerald"
        />
        <StatCard
          icon={Sparkles}
          label="Oportunidad alta"
          value={stats.hot}
          hint="Sitios con mejoras urgentes"
          accent="amber"
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-5">
        <section className="card card-pad animate-fade-up xl:col-span-3">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-white">Embudo de prospección</h2>
              <p className="mt-0.5 text-xs text-slate-500">Lista actual de resultados</p>
            </div>
            <span className="chip">
              <Users className="h-3 w-3" /> {recipients.length} destinatarios listos
            </span>
          </div>
          <div className="mt-5 space-y-3.5">
            {funnel.map((row) => {
              const width = prospects.length ? Math.max(row.value ? 4 : 0, pct(row.value, prospects.length)) : 0;
              return (
                <div key={row.label}>
                  <div className="mb-1.5 flex items-center justify-between text-xs">
                    <span className="text-slate-400">{row.label}</span>
                    <span className="font-semibold text-slate-200 tabular-nums">
                      {row.value}
                      <span className="ml-1.5 font-normal text-slate-600">{pct(row.value, prospects.length)}%</span>
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-white/[0.05]">
                    <div
                      className={`h-full rounded-full bg-gradient-to-r ${row.color} transition-[width] duration-700`}
                      style={{ width: `${width}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
          {prospects.length === 0 && (
            <p className="mt-5 rounded-xl border border-dashed border-white/10 px-4 py-3 text-center text-xs text-slate-500">
              Aún no hay prospectos. Lanza una búsqueda para llenar el embudo.
            </p>
          )}
        </section>

        <section className="card card-pad animate-fade-up xl:col-span-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white">Primeros pasos</h2>
            <span className="text-xs font-medium text-slate-400 tabular-nums">
              {completed}/{steps.length}
            </span>
          </div>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/[0.05]">
            <div
              className="h-full rounded-full bg-gradient-to-r from-violet-500 to-cyan-400 transition-[width] duration-700"
              style={{ width: `${pct(completed, steps.length)}%` }}
            />
          </div>
          <ol className="mt-4 space-y-2">
            {steps.map((step) => (
              <li
                key={step.title}
                className="flex items-start gap-3 rounded-xl border border-white/[0.05] bg-white/[0.015] p-3"
              >
                {step.done ? (
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                ) : (
                  <Circle className="mt-0.5 h-4 w-4 shrink-0 text-slate-600" />
                )}
                <div className="min-w-0 flex-1">
                  <p className={`text-xs font-semibold ${step.done ? "text-slate-500 line-through" : "text-slate-200"}`}>
                    {step.title}
                  </p>
                  {!step.done && <p className="mt-0.5 text-[11px] leading-snug text-slate-500">{step.text}</p>}
                </div>
                {!step.done && (
                  <button type="button" onClick={step.action} className="btn btn-sm btn-secondary">
                    {step.cta}
                  </button>
                )}
              </li>
            ))}
          </ol>
        </section>
      </div>

      <div className="grid gap-6 xl:grid-cols-5">
        <section className="card animate-fade-up overflow-hidden xl:col-span-3">
          <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-4 sm:px-6">
            <div>
              <h2 className="text-sm font-semibold text-white">Historial de campañas</h2>
              <p className="mt-0.5 text-xs text-slate-500">Resultados por destinatario y errores de entrega</p>
            </div>
            {campaigns.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  if (window.confirm("¿Borrar el historial de campañas?")) clearCampaigns();
                }}
                className="btn btn-sm btn-ghost"
              >
                <Trash2 className="h-3.5 w-3.5" /> Limpiar
              </button>
            )}
          </div>
          {campaigns.length === 0 ? (
            <EmptyState
              icon={History}
              title="Sin campañas todavía"
              description="Cuando envíes una campaña verás aquí sus resultados, con el detalle de cada destinatario."
              action={
                <button type="button" onClick={() => setTab("sender")} className="btn btn-sm btn-primary">
                  Crear campaña <ArrowRight className="h-3.5 w-3.5" />
                </button>
              }
            />
          ) : (
            <ul className="divide-y divide-white/[0.05]">
              {campaigns.slice(0, 8).map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => setOpenCampaign(c)}
                    className="flex w-full items-center gap-4 px-5 py-3.5 text-left transition hover:bg-white/[0.03] sm:px-6"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/[0.05] text-slate-400">
                      <Send className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-slate-100">{c.subject}</span>
                      <span className="mt-0.5 flex items-center gap-2 text-[11px] text-slate-500">
                        <Clock className="h-3 w-3" /> {formatDate(c.createdAt)}
                        {c.mode === "simulated" && <span className="badge border-sky-500/30 text-sky-300">Demo</span>}
                        {c.cancelled && <span className="badge border-amber-500/30 text-amber-300">Detenida</span>}
                      </span>
                    </span>
                    <span className="text-right text-xs tabular-nums">
                      <span className="block font-semibold text-emerald-400">{c.sent} enviados</span>
                      {c.failed > 0 && <span className="block text-rose-400">{c.failed} fallidos</span>}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card card-pad animate-fade-up xl:col-span-2">
          <h2 className="text-sm font-semibold text-white">Búsquedas recientes</h2>
          <p className="mt-0.5 text-xs text-slate-500">Repite una búsqueda con un clic</p>
          {recentSearches.length === 0 ? (
            <EmptyState icon={Globe} title="Sin búsquedas" description="Tus búsquedas aparecerán aquí." />
          ) : (
            <ul className="mt-4 space-y-2">
              {recentSearches.map((s) => (
                <li key={`${s.niche}-${s.city}-${s.at}`}>
                  <button
                    type="button"
                    onClick={() => {
                      setSearchDraft({ niche: s.niche, city: s.city });
                      setTab("search");
                    }}
                    className="group flex w-full items-center gap-3 rounded-xl border border-white/[0.05] bg-white/[0.015] px-3.5 py-2.5 text-left transition hover:border-violet-400/30 hover:bg-violet-500/5"
                  >
                    <Search className="h-3.5 w-3.5 text-slate-500 group-hover:text-violet-300" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-medium text-slate-200">
                        {s.niche || "Negocios"} · {s.city}
                      </span>
                      <span className="block text-[11px] text-slate-500">
                        {s.count} resultados · {formatDate(s.at)}
                      </span>
                    </span>
                    <ArrowRight className="h-3.5 w-3.5 text-slate-600 transition group-hover:translate-x-0.5 group-hover:text-violet-300" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <Modal
        open={openCampaign !== null}
        onClose={() => setOpenCampaign(null)}
        title={openCampaign?.subject ?? "Campaña"}
        description={openCampaign ? `${formatDate(openCampaign.createdAt)} · ${openCampaign.total} destinatarios` : undefined}
        className="max-w-2xl"
      >
        {openCampaign && <CampaignDetail campaign={openCampaign} />}
      </Modal>
    </div>
  );
}

function CampaignDetail({ campaign }: { campaign: CampaignRecord }) {
  return (
    <div>
      <div className="grid grid-cols-3 gap-3">
        <MiniStat label="Enviados" value={campaign.sent} tone="text-emerald-400" />
        <MiniStat label="Fallidos" value={campaign.failed} tone="text-rose-400" />
        <MiniStat label="Sin procesar" value={Math.max(0, campaign.total - campaign.sent - campaign.failed)} tone="text-slate-300" />
      </div>
      <ul className="mt-5 max-h-[50vh] space-y-1.5 overflow-y-auto pr-1">
        {campaign.results.map((r, i) => (
          <li
            key={`${r.email}-${i}`}
            className="flex items-start gap-3 rounded-xl border border-white/[0.05] bg-white/[0.02] px-3.5 py-2.5"
          >
            {r.ok ? (
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
            ) : (
              <Circle className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />
            )}
            <div className="min-w-0">
              <p className="truncate text-xs font-medium text-slate-200">
                {r.empresa} <span className="text-slate-500">· {r.email}</span>
              </p>
              {r.message && <p className="mt-0.5 text-[11px] text-rose-300/80">{r.message}</p>}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function MiniStat({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] px-3 py-3 text-center">
      <p className={`text-2xl font-semibold tabular-nums ${tone}`}>{value}</p>
      <p className="mt-0.5 text-xs text-slate-500">{label}</p>
    </div>
  );
}
