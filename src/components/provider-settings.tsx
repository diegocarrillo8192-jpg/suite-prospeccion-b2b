"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  DEFAULT_APIFY_ACTOR,
  clearProviderKeys,
  getProvidersSnapshot,
  getServerProvidersSnapshot,
  saveProviderConfig,
  subscribeProviders,
  type ProviderConfig,
} from "@/lib/providers";

interface Props {
  open: boolean;
  onClose: () => void;
}

export function ProviderSettings({ open, onClose }: Props) {
  return <ProviderSettingsPanel open={open} onClose={onClose} />;
}

function ProviderSettingsPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const config = useSyncExternalStore(
    subscribeProviders,
    getProvidersSnapshot,
    getServerProvidersSnapshot
  );
  const [apifyToken, setApifyToken] = useState(config.apifyToken);
  const [apifyActor, setApifyActor] = useState(config.apifyActor || DEFAULT_APIFY_ACTOR);
  const [googleKey, setGoogleKey] = useState(config.googleKey);
  const [msg, setMsg] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    dialog.setAttribute("closedby", "any");
    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
  }, [open]);

  function onSave() {
    const next: ProviderConfig = {
      engine: config.engine,
      apifyToken,
      apifyActor,
      googleKey,
    };
    saveProviderConfig(next);
    setMsg("Configuración guardada de forma segura en este dispositivo.");
  }

  function onClear() {
    clearProviderKeys();
    setApifyToken("");
    setApifyActor(DEFAULT_APIFY_ACTOR);
    setGoogleKey("");
    setMsg("Claves de API eliminadas del dispositivo.");
  }

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      onCancel={onClose}
      aria-label="Configuración de proveedores y APIs"
      className="settings-dialog animate-pop-in m-auto max-h-[90vh] w-[calc(100%-2rem)] max-w-lg overflow-y-auto rounded-2xl border border-slate-800 bg-[#0f172a] p-6 text-slate-100 shadow-2xl"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold text-slate-100">
            Configuración de Proveedores / APIs
          </h3>
          <p className="mt-1 text-xs text-slate-500">
            Las claves se guardan ofuscadas en el almacenamiento local de tu navegador.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar"
          className="rounded-lg px-2 py-1 text-sm text-slate-400 transition hover:bg-slate-800 hover:text-slate-200"
        >
          ✕
        </button>
      </div>

      <div className="mt-5 space-y-4">
        <ProviderCard
          title="Motor Gratuito Local"
          subtitle="OpenStreetMap (Overpass) + Google Maps · Sin API Key"
          active
        >
          <p className="text-xs text-slate-500">
            Motor por defecto. Extrae empresas locales desde OpenStreetMap, Google Maps y
            buscadores web sin credenciales.
          </p>
        </ProviderCard>

        <ProviderCard
          title="Apify API"
          subtitle="Scraper en la nube de Google Maps · Rápido y masivo"
          active={apifyToken.trim().length > 0}
        >
          <SecretInput
            label="API Key de Apify"
            value={apifyToken}
            onChange={setApifyToken}
            placeholder="apify_api_xxxxxxxxxxxxxxxx"
          />
          <label className="mt-3 block">
            <span className="mb-1.5 block text-xs font-medium text-slate-400">
              Actor de Google Maps (opcional)
            </span>
            <input
              value={apifyActor}
              onChange={(e) => setApifyActor(e.target.value)}
              placeholder={DEFAULT_APIFY_ACTOR}
              className="w-full rounded-lg border border-slate-700 bg-slate-900/60 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 outline-none focus:border-sky-500"
            />
          </label>
        </ProviderCard>

        <ProviderCard
          title="Google Maps / Places API"
          subtitle="API oficial de Google Cloud · Datos verificados"
          active={googleKey.trim().length > 0}
        >
          <SecretInput
            label="Google Cloud API Key"
            value={googleKey}
            onChange={setGoogleKey}
            placeholder="AIzaSyXXXXXXXXXXXXXXXXXXXX"
          />
        </ProviderCard>
      </div>

      <div className="mt-6 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={onSave}
          className="flex-1 rounded-xl bg-sky-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-sky-400"
        >
          Guardar configuración
        </button>
        <button
          type="button"
          onClick={onClear}
          className="rounded-xl border border-slate-700 px-4 py-2.5 text-sm font-medium text-slate-300 transition hover:bg-slate-800"
        >
          Borrar claves
        </button>
      </div>

      {msg && <p className="mt-3 text-xs text-emerald-400">{msg}</p>}
    </dialog>
  );
}

function ProviderCard({
  title,
  subtitle,
  active,
  children,
}: {
  title: string;
  subtitle: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-100">{title}</p>
          <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>
        </div>
        <span
          className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium ${
            active ? "bg-emerald-500/15 text-emerald-400" : "bg-slate-800 text-slate-500"
          }`}
        >
          {active ? "Configurado" : "Sin clave"}
        </span>
      </div>
      <div className="mt-3">{children}</div>
    </div>
  );
}

function SecretInput({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  const [visible, setVisible] = useState(false);
  const inputId = useId();
  return (
    <div className="block">
      <label
        htmlFor={inputId}
        className="mb-1.5 block text-xs font-medium text-slate-400"
      >
        {label}
      </label>
      <div className="flex gap-2">
        <input
          id={inputId}
          type={visible ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete="off"
          spellCheck={false}
          className="w-full rounded-lg border border-slate-700 bg-slate-900/60 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 outline-none focus:border-sky-500"
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          className="shrink-0 rounded-lg border border-slate-700 px-3 text-xs font-medium text-slate-400 transition hover:bg-slate-800 hover:text-slate-200"
        >
          {visible ? "Ocultar" : "Ver"}
        </button>
      </div>
    </div>
  );
}
