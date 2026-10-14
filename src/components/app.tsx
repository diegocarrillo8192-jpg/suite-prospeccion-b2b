"use client";

import { useEffect, useLayoutEffect, useState } from "react";
import { AppStateProvider, useAppState } from "./app-state";
import { SplashScreen } from "./splash-screen";
import { MobileNav, Sidebar } from "./header";
import { Dashboard } from "./dashboard";
import { ProspectSearch } from "./prospect-search";
import { EmailSender } from "./email-sender";
import { Connectors } from "./connectors";
import { Guide } from "./guide";
import { Toaster } from "./ui";

declare global {
  interface Window {
    /** Decisión del script de <head> (layout.tsx): reproducir u omitir el splash. */
    __b2bSplash?: "play" | "skip";
  }
}

/** Respaldo por si el navegador no emite `animationend` (pestaña en segundo plano, jsdom). */
const SPLASH_FALLBACK_MS = 2400;

function AppShell({ revealing }: { revealing: boolean }) {
  const { tab } = useAppState();

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [tab]);

  return (
    <div
      className={`relative flex min-h-screen ${revealing ? "app-shell-reveal" : ""}`}
      inert={revealing}
      aria-hidden={revealing || undefined}
    >
      <div className="app-backdrop" aria-hidden="true" />
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <MobileNav />
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 pt-6 pb-28 sm:px-6 lg:px-10 lg:pt-10 lg:pb-12">
          <div key={tab} className="animate-fade-in">
            {tab === "dashboard" && <Dashboard />}
            {tab === "search" && <ProspectSearch />}
            {tab === "sender" && <EmailSender />}
            {tab === "connectors" && <Connectors />}
            {tab === "guide" && <Guide />}
          </div>
        </main>
      </div>
      <Toaster />
    </div>
  );
}

export function App() {
  // El splash forma parte del HTML del servidor: es lo primero que se pinta y
  // la interfaz queda oculta (CSS) hasta que termina la animación.
  const [splash, setSplash] = useState(true);

  useLayoutEffect(() => {
    if (window.__b2bSplash === "skip") {
      document.documentElement.setAttribute("data-splash", "skip");
      /* eslint-disable-next-line react-hooks/set-state-in-effect -- sincroniza con la decisión del script de <head> antes del pintado */
      setSplash(false);
      return;
    }
    const t = setTimeout(() => setSplash(false), SPLASH_FALLBACK_MS);
    return () => clearTimeout(t);
  }, []);

  return (
    <AppStateProvider>
      {splash && <SplashScreen onFinish={() => setSplash(false)} />}
      <AppShell revealing={splash} />
    </AppStateProvider>
  );
}
