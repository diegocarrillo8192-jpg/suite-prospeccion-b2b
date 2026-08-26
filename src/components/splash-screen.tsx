"use client";

import { Logo } from "./logo";

export function SplashScreen() {
  return (
    <div className="animate-splash-overlay fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#020617]">
      <div className="animate-splash-zoom flex flex-col items-center gap-7">
        <div className="relative">
          <span className="absolute inset-0 -z-10 rounded-2xl bg-sky-400/30 blur-3xl" />
          <Logo size={104} />
        </div>
        <div className="text-center">
          <h1 className="text-xl font-semibold tracking-tight text-slate-100">
            Suite de Prospección B2B
          </h1>
          <p className="mt-1.5 text-sm text-slate-500">Buscador de leads · Correos masivos</p>
        </div>
      </div>
    </div>
  );
}
