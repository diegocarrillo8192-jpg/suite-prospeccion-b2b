"use client";

import {
  DEFAULT_MAILER_CONFIG,
  DEFAULT_DELAY_MAX_SEC,
  DEFAULT_DELAY_MIN_SEC,
  GMAIL_SMTP_PORT,
  clampDelayRange,
  isMailerMode,
  providerConfigFrom,
  type MailerConfig,
  type ProviderConfig,
} from "./email-providers";

export {
  MAILER_MODES,
  REPLY_TO_PLACEHOLDER,
  SENDER_EMAIL_PLACEHOLDER,
  SENDER_NAME_PLACEHOLDER,
  DELAY_MIN_SEC,
  DELAY_MAX_SEC,
  DEFAULT_DELAY_MIN_SEC,
  DEFAULT_DELAY_MAX_SEC,
  GMAIL_SMTP_HOST,
  GMAIL_SMTP_PORT,
  clampDelayRange,
  mailerModeLabel,
  isMailerConfigured,
  providerConfigFrom,
  randomDelaySec,
  averageDelaySec,
} from "./email-providers";
export type { MailerConfig, MailerMode, ProviderConfig } from "./email-providers";

const STORAGE_KEY = "b2b.mailer.v1";
const OBFUSCATION_KEY = "suite-prospeccion-b2b::mailer::v1";

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

function readString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function readDelay(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function readConfig(): MailerConfig {
  if (typeof window === "undefined") return DEFAULT_MAILER_CONFIG;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_MAILER_CONFIG;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const delays = clampDelayRange(
      readDelay(parsed.delayMinSec, DEFAULT_DELAY_MIN_SEC),
      readDelay(parsed.delayMaxSec, DEFAULT_DELAY_MAX_SEC)
    );
    return {
      mode: isMailerMode(parsed.mode) ? parsed.mode : DEFAULT_MAILER_CONFIG.mode,
      senderName: readString(parsed.senderName),
      senderEmail: readString(parsed.senderEmail),
      replyTo: readString(parsed.replyTo),
      smtpHost: readString(parsed.smtpHost),
      smtpPort: readString(parsed.smtpPort) || GMAIL_SMTP_PORT,
      smtpUser: readString(parsed.smtpUser),
      smtpPass: deobfuscate(readString(parsed.smtpPass)),
      appPassword: deobfuscate(readString(parsed.appPassword)),
      resendKey: deobfuscate(readString(parsed.resendKey)),
      sendgridKey: deobfuscate(readString(parsed.sendgridKey)),
      delayMinSec: delays.minSec,
      delayMaxSec: delays.maxSec,
    };
  } catch {
    return DEFAULT_MAILER_CONFIG;
  }
}

let cache: MailerConfig | null = null;

const listeners = new Set<() => void>();

function emitChange(): void {
  for (const listener of listeners) listener();
}

export function subscribeMailer(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getMailerSnapshot(): MailerConfig {
  if (typeof window === "undefined") return DEFAULT_MAILER_CONFIG;
  if (!cache) cache = readConfig();
  return cache;
}

export function getServerMailerSnapshot(): MailerConfig {
  return DEFAULT_MAILER_CONFIG;
}

export function saveMailerConfig(config: MailerConfig): void {
  const delays = clampDelayRange(config.delayMinSec, config.delayMaxSec);
  const next: MailerConfig = {
    mode: isMailerMode(config.mode) ? config.mode : DEFAULT_MAILER_CONFIG.mode,
    senderName: config.senderName.trim(),
    senderEmail: config.senderEmail.trim(),
    replyTo: config.replyTo.trim(),
    smtpHost: config.smtpHost.trim(),
    smtpPort: config.smtpPort.trim() || GMAIL_SMTP_PORT,
    smtpUser: config.smtpUser.trim(),
    smtpPass: config.smtpPass.trim(),
    appPassword: config.appPassword.trim(),
    resendKey: config.resendKey.trim(),
    sendgridKey: config.sendgridKey.trim(),
    delayMinSec: delays.minSec,
    delayMaxSec: delays.maxSec,
  };
  cache = next;
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          mode: next.mode,
          senderName: next.senderName,
          senderEmail: next.senderEmail,
          replyTo: next.replyTo,
          smtpHost: next.smtpHost,
          smtpPort: next.smtpPort,
          smtpUser: next.smtpUser,
          smtpPass: obfuscate(next.smtpPass),
          appPassword: obfuscate(next.appPassword),
          resendKey: obfuscate(next.resendKey),
          sendgridKey: obfuscate(next.sendgridKey),
          delayMinSec: next.delayMinSec,
          delayMaxSec: next.delayMaxSec,
        })
      );
    } catch {
      // almacenamiento no disponible
    }
  }
  emitChange();
}

export function updateMailerConfig(patch: Partial<MailerConfig>): MailerConfig {
  const next: MailerConfig = { ...getMailerSnapshot(), ...patch };
  saveMailerConfig(next);
  return getMailerSnapshot();
}

export function clearMailerSecrets(): void {
  const current = getMailerSnapshot();
  saveMailerConfig({
    ...current,
    smtpPass: "",
    appPassword: "",
    resendKey: "",
    sendgridKey: "",
  });
}

export function getProviderConfig(): ProviderConfig {
  return providerConfigFrom(getMailerSnapshot());
}
