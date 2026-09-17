"use client";

export type MailerMode = "smtp" | "resend" | "sendgrid" | "simulated";

export interface MailerConfig {
  mode: MailerMode;
  senderName: string;
  senderEmail: string;
  replyTo: string;
  smtpHost: string;
  smtpPort: string;
  smtpUser: string;
  smtpPass: string;
  resendKey: string;
  sendgridKey: string;
}

export const SENDER_NAME_PLACEHOLDER = "Ej. Tu Nombre | Nombre de Empresa";
export const SENDER_EMAIL_PLACEHOLDER = "ventas@tudominio.com";
export const REPLY_TO_PLACEHOLDER = "contacto@tudominio.com";

export const MAILER_MODES: { id: MailerMode; label: string; hint: string }[] = [
  {
    id: "smtp",
    label: "SMTP Personalizado",
    hint: "Conecta tu propio servidor de correo saliente.",
  },
  {
    id: "resend",
    label: "Resend API Key",
    hint: "Envío transaccional a través de Resend.",
  },
  {
    id: "sendgrid",
    label: "SendGrid API Key",
    hint: "Envío transaccional a través de SendGrid.",
  },
  {
    id: "simulated",
    label: "Simulado (Demo)",
    hint: "No se envían correos reales, ideal para probar el flujo.",
  },
];

export const DEFAULT_MAILER_CONFIG: MailerConfig = {
  mode: "smtp",
  senderName: "",
  senderEmail: "",
  replyTo: "",
  smtpHost: "",
  smtpPort: "587",
  smtpUser: "",
  smtpPass: "",
  resendKey: "",
  sendgridKey: "",
};

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

function isMailerMode(value: unknown): value is MailerMode {
  return value === "smtp" || value === "resend" || value === "sendgrid" || value === "simulated";
}

function readString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function readConfig(): MailerConfig {
  if (typeof window === "undefined") return DEFAULT_MAILER_CONFIG;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_MAILER_CONFIG;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return {
      mode: isMailerMode(parsed.mode) ? parsed.mode : DEFAULT_MAILER_CONFIG.mode,
      senderName: readString(parsed.senderName),
      senderEmail: readString(parsed.senderEmail),
      replyTo: readString(parsed.replyTo),
      smtpHost: readString(parsed.smtpHost),
      smtpPort: readString(parsed.smtpPort) || DEFAULT_MAILER_CONFIG.smtpPort,
      smtpUser: readString(parsed.smtpUser),
      smtpPass: deobfuscate(readString(parsed.smtpPass)),
      resendKey: deobfuscate(readString(parsed.resendKey)),
      sendgridKey: deobfuscate(readString(parsed.sendgridKey)),
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
  const next: MailerConfig = {
    mode: config.mode,
    senderName: config.senderName.trim(),
    senderEmail: config.senderEmail.trim(),
    replyTo: config.replyTo.trim(),
    smtpHost: config.smtpHost.trim(),
    smtpPort: config.smtpPort.trim() || DEFAULT_MAILER_CONFIG.smtpPort,
    smtpUser: config.smtpUser.trim(),
    smtpPass: config.smtpPass.trim(),
    resendKey: config.resendKey.trim(),
    sendgridKey: config.sendgridKey.trim(),
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
          resendKey: obfuscate(next.resendKey),
          sendgridKey: obfuscate(next.sendgridKey),
        })
      );
    } catch {
      // almacenamiento no disponible
    }
  }
  emitChange();
}

export function clearMailerSecrets(): void {
  const current = getMailerSnapshot();
  saveMailerConfig({
    ...current,
    smtpPass: "",
    resendKey: "",
    sendgridKey: "",
  });
}

export function mailerModeLabel(mode: MailerMode): string {
  return MAILER_MODES.find((m) => m.id === mode)?.label ?? "SMTP Personalizado";
}

export function isMailerConfigured(config: MailerConfig): boolean {
  if (!config.senderEmail.trim()) return false;
  if (config.mode === "smtp") return config.smtpHost.trim().length > 0;
  if (config.mode === "resend") return config.resendKey.trim().length > 0;
  if (config.mode === "sendgrid") return config.sendgridKey.trim().length > 0;
  return true;
}
