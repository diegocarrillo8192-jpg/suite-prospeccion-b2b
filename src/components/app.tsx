"use client";

import { useEffect, useState } from "react";
import { AppStateProvider, useAppState } from "./app-state";
import { SplashScreen } from "./splash-screen";
import { Header } from "./header";
import { ProspectSearch } from "./prospect-search";
import { EmailSender } from "./email-sender";

function AppShell() {
  const { tab } = useAppState();

  return (
    <div className="relative flex min-h-screen flex-col">
      <Header />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">
        {tab === "search" ? (
          <div key="search" className="animate-fade-in">
            <ProspectSearch />
          </div>
        ) : (
          <div key="sender" className="animate-fade-in">
            <EmailSender />
          </div>
        )}
      </main>
      <footer className="mx-auto w-full max-w-6xl px-6 py-6 text-center text-xs text-slate-600">
        Suite de Prospección B2B · Demo
      </footer>
    </div>
  );
}

export function App() {
  const [booting, setBooting] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => setBooting(false), 2000);
    return () => clearTimeout(t);
  }, []);

  return (
    <AppStateProvider>
      {booting && <SplashScreen />}
      <AppShell />
    </AppStateProvider>
  );
}
