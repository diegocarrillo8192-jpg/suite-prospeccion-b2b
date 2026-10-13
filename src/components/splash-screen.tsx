"use client";

import { Logo } from "./logo";

export function SplashScreen() {
  return (
    <div className="animate-splash-overlay fixed inset-0 z-[70] flex flex-col items-center justify-center bg-[#05070d]">
      <div className="animate-splash-zoom flex flex-col items-center gap-6">
        <div className="relative">
          <span className="absolute -inset-6 -z-10 rounded-full bg-violet-500/30 blur-3xl" />
          <Logo size={96} />
        </div>
        <div className="text-center">
          <p className="text-2xl font-semibold tracking-tight text-white">
            Suite de Prospección <span className="text-gradient">B2B</span>
          </p>
          <p className="mt-1.5 text-sm text-slate-500">Leads · Enriquecimiento · Campañas</p>
        </div>
      </div>
    </div>
  );
}
