"use client";

import { useId, useState, useSyncExternalStore } from "react";
import { Modal } from "./modal";
import {
  DEFAULT_APIFY_ACTOR,
  DEFAULT_EMAIL_ACTOR,
  clearProviderKeys,
  getProvidersSnapshot,
  getServerProvidersSnapshot,
  hasAnyApiKey,
  isApiMode,
  preferredApiEngine,
  saveProviderConfig,
  subscribeProviders,
  type EngineId,
  type ProviderConfig,
} from "@/lib/providers";

interface Props {
  open: boolean;
  onClose: () => void;
}

export function ProviderSettings({ open, onClose }: Props) {
  const config = useSyncExternalStore(
    subscribeProviders,
    getProvidersSnapshot,
    getServerProvidersSnapshot
  );
  const [apifyToken, setApifyToken] = useState(config.apifyToken);
  const [apifyActor, setApifyActor] = useState(config.apifyActor || DEFAULT_APIFY_ACTOR);
  const [emailActor, setEmailActor] = useState(config.emailActor || DEFAULT_EMAIL_ACTOR);
  const [googleKey, setGoogleKey] = useState(config.googleKey);
  const [msg, setMsg] = useState<string | null>(null);

  const apiMode = isApiMode(config.engine);
  const apiReady = hasAnyApiKey(config);

  function setMode(next: "local" | "api") {
    const engine: EngineId =
      next === "local" ? "free" : preferredApiEngine(config) === "free" ? "apify" : preferredApiEngine(config);
    saveProviderConfig({ ...config, engine });
    setMsg(next === "local" ? "Modo Gratis activado: sin créditos ni claves." : "Modo API Key activado.");
  }

  function setApiEngine(engine: EngineId) {
    saveProviderConfig({ ...config, engine });
  }

  function onSave() {
    const next: ProviderConfig = {
      engine: config.engine,
      apifyToken,
      apifyActor,
      emailActor,
      googleKey,
    };
    saveProviderConfig(next);
    setMsg("Configuración guardada de forma segura en este dispositivo.");
  }

  function onClear() {
    clearProviderKeys();
    setApifyToken("");
    setApifyActor(DEFAULT_APIFY_ACTOR);
    setEmailActor(DEFAULT_EMAIL_ACTOR);
    setGoogleKey("");
    setMsg("Claves de API eliminadas del dispositivo.");
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Configuración de Proveedores / APIs"
      description="Las claves se guardan ofuscadas en el almacenamiento local de tu navegador."
    >
      <div className="space-y-4">
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 shadow-xl shadow-black/20 backdrop-blur-xl">
          <p className="text-sm font-semibold text-slate-100">Modo de extracción</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => setMode("local")}
              className={`rounded-xl border px-3 py-2.5 text-left text-sm transition ${
                apiMode
                  ? "border-white/10 text-slate-400 hover:bg-white/5"
                  : "border-sky-500/50 bg-sky-500/10 text-sky-200"
              }`}
            >
              <span className="block font-semibold">Modo Gratis (Scraping Local)</span>
              <span className="mt-0.5 block text-[11px] opacity-80">Playwright · Sin créditos</span>
            </button>
            <button
              type="button"
              onClick={() => setMode("api")}
              className={`rounded-xl border px-3 py-2.5 text-left text-sm transition ${
                apiMode
                  ? "border-sky-500/50 bg-sky-500/10 text-sky-200"
                  : "border-white/10 text-slate-400 hover:bg-white/5"
              }`}
            >
              <span className="block font-semibold">Modo API Key</span>
              <span className="mt-0.5 block text-[11px] opacity-80">
                {apiReady ? "Apify / Google Places" : "Añade una clave abajo"}
              </span>
            </button>
          </div>

          {apiMode && (
            <div className="mt-3">
              <span className="mb-1.5 block text-xs font-medium text-slate-400">Proveedor API</span>
              <select
                value={apiReady ? config.engine : "apify"}
                onChange={(e) => setApiEngine(e.target.value as EngineId)}
                className="w-full rounded-lg border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-sky-500"
              >
                <option value="apify">Apify Cloud API{config.apifyToken.trim() ? "" : " — sin clave"}</option>
                <option value="google">
                  Google Places API{config.googleKey.trim() ? "" : " — sin clave"}
                </option>
              </select>
            </div>
          )}

          {!apiMode && (
            <p className="mt-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-[11px] text-emerald-300">
              Modo Gratis: no requiere créditos ni claves de API. Usa scraping local de Google
              Maps (Playwright) y extrae correos, WhatsApp y redes sociales de cada sitio web.
            </p>
          )}
        </div>

        <ProviderCard
          title="Scraping Local (Playwright)"
          subtitle="Google Maps + OpenStreetMap + buscadores web · Sin API Key"
          active={!apiMode}
        >
          <p className="text-xs text-slate-400">
            Motor por defecto. Extrae nombre, teléfono, dirección, sitio web, categoría,
            calificación y reseñas directamente de Google Maps, y luego rastrea el sitio web de
            cada negocio para obtener correos, WhatsApp y redes sociales. Sin costo.
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
              className="w-full rounded-lg border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 outline-none transition focus:border-sky-500"
            />
          </label>
          <label className="mt-3 block">
            <span className="mb-1.5 block text-xs font-medium text-slate-400">
              Actor de extracción de correos (sitios web)
            </span>
            <input
              value={emailActor}
              onChange={(e) => setEmailActor(e.target.value)}
              placeholder={DEFAULT_EMAIL_ACTOR}
              className="w-full rounded-lg border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 outline-none transition focus:border-sky-500"
            />
            <span className="mt-1 block text-[11px] text-slate-500">
              Se usa para escanear las URLs de la columna “Sitio Web” y extraer correos. Si no hay
              API Key, se usa el extractor HTML local sin costo.
            </span>
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
          className="flex-1 rounded-xl bg-sky-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-sky-500/20 transition hover:bg-sky-400"
        >
          Guardar configuración
        </button>
        <button
          type="button"
          onClick={onClear}
          className="rounded-xl border border-white/10 px-4 py-2.5 text-sm font-medium text-slate-300 transition hover:bg-white/10"
        >
          Borrar claves
        </button>
      </div>

      {msg && <p className="mt-3 text-xs text-emerald-400">{msg}</p>}
    </Modal>
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
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 shadow-xl shadow-black/20 backdrop-blur-xl">
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
      <label htmlFor={inputId} className="mb-1.5 block text-xs font-medium text-slate-400">
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
          className="w-full rounded-lg border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 outline-none transition focus:border-sky-500"
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          className="shrink-0 rounded-lg border border-white/10 px-3 text-xs font-medium text-slate-400 transition hover:bg-white/10 hover:text-slate-200"
        >
          {visible ? "Ocultar" : "Ver"}
        </button>
      </div>
    </div>
  );
}
