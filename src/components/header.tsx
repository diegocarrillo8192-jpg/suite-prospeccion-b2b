"use client";

import { Logo } from "./logo";
import { useAppState } from "./app-state";
import type { TabId } from "@/lib/types";

const TABS: { id: TabId; label: string; short: string }[] = [
  { id: "search", label: "Buscador de Prospectos", short: "Buscador" },
  { id: "sender", label: "Emisor de Correos", short: "Emisor" },
];

export function Header({ onOpenSettings }: { onOpenSettings: () => void }) {
  const { tab, setTab } = useAppState();

  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-[#020617]/80 backdrop-blur-xl">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <div className="flex items-center gap-3">
          <Logo size={36} />
          <div className="leading-tight">
            <p className="text-sm font-semibold text-slate-100">Suite de Prospección B2B</p>
            <p className="hidden text-xs text-slate-500 sm:block">Leads &amp; Email</p>
          </div>
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          <SegmentedTabs value={tab} onChange={setTab} />
          <button
            type="button"
            onClick={onOpenSettings}
            title="Configuración de Proveedores / APIs"
            aria-label="Configuración de Proveedores / APIs"
            className="rounded-full border border-slate-800 bg-slate-900/60 p-2 text-slate-400 transition hover:bg-slate-800 hover:text-slate-200"
          >
            <GearIcon />
          </button>
        </div>
      </div>
    </header>
  );
}

function GearIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
    </svg>
  );
}

function SegmentedTabs({ value, onChange }: { value: TabId; onChange: (t: TabId) => void }) {
  return (
    <div className="flex items-center rounded-full border border-slate-800 bg-slate-900/60 p-1">
      {TABS.map((t) => {
        const active = t.id === value;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onChange(t.id)}
            className={`relative rounded-full px-3 py-1.5 text-xs font-medium transition-colors duration-200 sm:px-4 sm:text-sm ${
              active
                ? "bg-slate-700/70 text-white shadow-sm"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <span className="sm:hidden">{t.short}</span>
            <span className="hidden sm:inline">{t.label}</span>
          </button>
        );
      })}
    </div>
  );
}
