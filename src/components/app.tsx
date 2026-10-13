"use client";

import { useEffect, useState } from "react";
import { AppStateProvider, useAppState } from "./app-state";
import { SplashScreen } from "./splash-screen";
import { MobileNav, Sidebar } from "./header";
import { Dashboard } from "./dashboard";
import { ProspectSearch } from "./prospect-search";
import { EmailSender } from "./email-sender";
import { Connectors } from "./connectors";
import { Guide } from "./guide";
import { Toaster } from "./ui";

const SPLASH_KEY = "b2b.splash.seen";

function AppShell() {
  const { tab } = useAppState();

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [tab]);

  return (
    <div className="relative flex min-h-screen">
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
  const [booting, setBooting] = useState(false);

  useEffect(() => {
    let seen = true;
    try {
      seen = window.sessionStorage.getItem(SPLASH_KEY) === "1";
      window.sessionStorage.setItem(SPLASH_KEY, "1");
    } catch {
      // sin sessionStorage
    }
    if (seen) return;
    /* eslint-disable-next-line react-hooks/set-state-in-effect -- splash solo en la primera visita de la sesión */
    setBooting(true);
    const t = setTimeout(() => setBooting(false), 1800);
    return () => clearTimeout(t);
  }, []);

  return (
    <AppStateProvider>
      {booting && <SplashScreen />}
      <AppShell />
    </AppStateProvider>
  );
}
