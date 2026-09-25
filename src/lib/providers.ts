"use client";

import type { EngineId } from "./engines/engine";

export type { EngineId };

export interface ProviderConfig {
  engine: EngineId;
  apifyToken: string;
  apifyActor: string;
  emailActor: string;
  googleKey: string;
}

export const DEFAULT_APIFY_ACTOR = "compass/crawler-google-places";

export const DEFAULT_EMAIL_ACTOR = "vdrmota/contact-info-scraper";

export const DEFAULT_PROVIDER_CONFIG: ProviderConfig = {
  engine: "free",
  apifyToken: "",
  apifyActor: DEFAULT_APIFY_ACTOR,
  emailActor: DEFAULT_EMAIL_ACTOR,
  googleKey: "",
};

const STORAGE_KEY = "b2b.providers.v1";
const OBFUSCATION_KEY = "suite-prospeccion-b2b::providers::v1";

function xorCipher(text: string): string {
  let out = "";
  for (let i = 0; i < text.length; i++) {
    out += String.fromCharCode(
      text.charCodeAt(i) ^ OBFUSCATION_KEY.charCodeAt(i % OBFUSCATION_KEY.length)
    );
  }
  return out;
}

function obfuscate(value: string): string {
  if (!value) return "";
  try {
    return btoa(encodeURIComponent(xorCipher(value)));
  } catch {
    return "";
  }
}

function deobfuscate(value: string): string {
  if (!value) return "";
  try {
    return xorCipher(decodeURIComponent(atob(value)));
  } catch {
    return "";
  }
}

function isEngineId(value: unknown): value is EngineId {
  return value === "free" || value === "apify" || value === "google";
}

function readConfig(): ProviderConfig {
  if (typeof window === "undefined") return DEFAULT_PROVIDER_CONFIG;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PROVIDER_CONFIG;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return {
      engine: isEngineId(parsed.engine) ? parsed.engine : DEFAULT_PROVIDER_CONFIG.engine,
      apifyToken: deobfuscate(typeof parsed.apifyToken === "string" ? parsed.apifyToken : ""),
      apifyActor:
        (typeof parsed.apifyActor === "string" ? parsed.apifyActor : "") ||
        DEFAULT_APIFY_ACTOR,
      emailActor:
        (typeof parsed.emailActor === "string" ? parsed.emailActor : "") ||
        DEFAULT_EMAIL_ACTOR,
      googleKey: deobfuscate(typeof parsed.googleKey === "string" ? parsed.googleKey : ""),
    };
  } catch {
    return DEFAULT_PROVIDER_CONFIG;
  }
}

let cache: ProviderConfig | null = null;

const listeners = new Set<() => void>();

function emitChange(): void {
  for (const listener of listeners) listener();
}

export function subscribeProviders(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getProvidersSnapshot(): ProviderConfig {
  if (typeof window === "undefined") return DEFAULT_PROVIDER_CONFIG;
  if (!cache) cache = readConfig();
  return cache;
}

export function getServerProvidersSnapshot(): ProviderConfig {
  return DEFAULT_PROVIDER_CONFIG;
}

export function saveProviderConfig(config: ProviderConfig): void {
  const next: ProviderConfig = {
    engine: config.engine,
    apifyToken: config.apifyToken.trim(),
    apifyActor: config.apifyActor.trim() || DEFAULT_APIFY_ACTOR,
    emailActor: config.emailActor.trim() || DEFAULT_EMAIL_ACTOR,
    googleKey: config.googleKey.trim(),
  };
  cache = next;
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          engine: next.engine,
          apifyToken: obfuscate(next.apifyToken),
          apifyActor: next.apifyActor,
          emailActor: next.emailActor,
          googleKey: obfuscate(next.googleKey),
        })
      );
    } catch {
      // almacenamiento no disponible
    }
  }
  emitChange();
}

export function clearProviderKeys(): void {
  saveProviderConfig({
    engine: getProvidersSnapshot().engine,
    apifyToken: "",
    apifyActor: DEFAULT_APIFY_ACTOR,
    emailActor: DEFAULT_EMAIL_ACTOR,
    googleKey: "",
  });
}

export function hasEngineKey(config: ProviderConfig, engine: EngineId): boolean {
  if (engine === "apify") return config.apifyToken.trim().length > 0;
  if (engine === "google") return config.googleKey.trim().length > 0;
  return true;
}

export function hasAnyApiKey(config: ProviderConfig): boolean {
  return config.apifyToken.trim().length > 0 || config.googleKey.trim().length > 0;
}

export function preferredApiEngine(config: ProviderConfig): EngineId {
  if (config.googleKey.trim().length > 0) return "google";
  if (config.apifyToken.trim().length > 0) return "apify";
  return "free";
}

export function isApiMode(engine: EngineId): boolean {
  return engine === "apify" || engine === "google";
}

export function engineLabel(engine: EngineId): string {
  if (engine === "apify") return "Apify Cloud API";
  if (engine === "google") return "Google Places Official API";
  return "Scraping Local (Playwright)";
}

export function maskSecret(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (trimmed.length <= 8) return "••••••";
  return `${trimmed.slice(0, 4)}••••••${trimmed.slice(-4)}`;
}
