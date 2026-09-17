"use client";

import { useEffect, useState } from "react";
import { AppStateProvider, useAppState } from "./app-state";
import { SplashScreen } from "./splash-screen";
import { Header } from "./header";
import { ProspectSearch } from "./prospect-search";
import { EmailSender } from "./email-sender";
import { ProviderSettings } from "./provider-settings";

function AppShell() {
  const { tab } = useAppState();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const openSettings = () => setSettingsOpen(true);

  return (
    <div className="relative flex min-h-screen flex-col">
      <Header onOpenSettings={openSettings} />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">
        {tab === "search" ? (
          <div key="search" className="animate-fade-in">
            <ProspectSearch onOpenSettings={openSettings} />
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
      <ProviderSettings open={settingsOpen} onClose={() => setSettingsOpen(false)} />
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
