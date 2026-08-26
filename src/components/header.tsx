"use client";

import { Logo } from "./logo";
import { useAppState } from "./app-state";
import type { TabId } from "@/lib/types";

const TABS: { id: TabId; label: string; short: string }[] = [
  { id: "search", label: "Buscador de Prospectos", short: "Buscador" },
  { id: "sender", label: "Emisor de Correos", short: "Emisor" },
];

export function Header() {
  const { tab, setTab } = useAppState();

  return (
    <header className="sticky top-0 z-40 border-b border-slate-800/70 bg-[#020617]/80 backdrop-blur-xl">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <div className="flex items-center gap-3">
          <Logo size={36} />
          <div className="leading-tight">
            <p className="text-sm font-semibold text-slate-100">Suite de Prospección B2B</p>
            <p className="hidden text-xs text-slate-500 sm:block">Leads &amp; Email</p>
          </div>
        </div>
        <SegmentedTabs value={tab} onChange={setTab} />
      </div>
    </header>
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
