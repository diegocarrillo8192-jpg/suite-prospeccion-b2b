export type MailerMode = "gmail" | "smtp" | "resend" | "sendgrid" | "simulated";

export interface MailerConfig {
  mode: MailerMode;
  senderName: string;
  senderEmail: string;
  replyTo: string;
  smtpHost: string;
  smtpPort: string;
  smtpUser: string;
  smtpPass: string;
  appPassword: string;
  resendKey: string;
  sendgridKey: string;
  delayMinSec: number;
  delayMaxSec: number;
}

export interface ProviderConfig {
  mode: MailerMode;
  senderName: string;
  senderEmail: string;
  replyTo: string;
  smtpHost: string;
  smtpPort: string;
  smtpUser: string;
  smtpPass: string;
  appPassword: string;
  resendKey: string;
  sendgridKey: string;
}

export const SENDER_NAME_PLACEHOLDER = "Ej. Tu Nombre | Nombre de Empresa";
export const SENDER_EMAIL_PLACEHOLDER = "ventas@tudominio.com";
export const REPLY_TO_PLACEHOLDER = "contacto@tudominio.com";

export const GMAIL_SMTP_HOST = "smtp.gmail.com";
export const GMAIL_SMTP_PORT = "587";

export const DELAY_MIN_SEC = 10;
export const DELAY_MAX_SEC = 30;
export const DEFAULT_DELAY_MIN_SEC = 10;
export const DEFAULT_DELAY_MAX_SEC = 30;

export const MAILER_MODES: { id: MailerMode; label: string; hint: string }[] = [
  {
    id: "gmail",
    label: "Gmail / App Password",
    hint: "Conecta una cuenta de Gmail o Google Workspace con una App Password.",
  },
  {
    id: "smtp",
    label: "SMTP Personalizado",
    hint: "Conecta tu propio servidor de correo saliente (Outlook, Zoho, Yahoo, etc.).",
  },
  {
    id: "resend",
    label: "Resend API",
    hint: "Envío transaccional a través de la API de Resend.",
  },
  {
    id: "sendgrid",
    label: "SendGrid API",
    hint: "Envío transaccional a través de la API de SendGrid.",
  },
  {
    id: "simulated",
    label: "Simulado (Demo)",
    hint: "No se envían correos reales, ideal para probar todo el flujo.",
  },
];

export const DEFAULT_MAILER_CONFIG: MailerConfig = {
  mode: "gmail",
  senderName: "",
  senderEmail: "",
  replyTo: "",
  smtpHost: "",
  smtpPort: GMAIL_SMTP_PORT,
  smtpUser: "",
  smtpPass: "",
  appPassword: "",
  resendKey: "",
  sendgridKey: "",
  delayMinSec: DEFAULT_DELAY_MIN_SEC,
  delayMaxSec: DEFAULT_DELAY_MAX_SEC,
};

export function isMailerMode(value: unknown): value is MailerMode {
  return (
    value === "gmail" ||
    value === "smtp" ||
    value === "resend" ||
    value === "sendgrid" ||
    value === "simulated"
  );
}

export function mailerModeLabel(mode: MailerMode): string {
  return MAILER_MODES.find((m) => m.id === mode)?.label ?? "SMTP Personalizado";
}

export function isMailerConfigured(config: ProviderConfig): boolean {
  if (!config.senderEmail?.trim()) return false;
  switch (config.mode) {
    case "gmail":
      return Boolean(config.appPassword?.trim());
    case "smtp":
      return Boolean(config.smtpHost?.trim());
    case "resend":
      return Boolean(config.resendKey?.trim());
    case "sendgrid":
      return Boolean(config.sendgridKey?.trim());
    case "simulated":
      return true;
    default:
      return false;
  }
}

export function clampDelayRange(min: number, max: number): { minSec: number; maxSec: number } {
  const safe = (n: number, fallback: number) =>
    Number.isFinite(n) ? Math.min(DELAY_MAX_SEC, Math.max(DELAY_MIN_SEC, Math.round(n))) : fallback;
  const minSec = safe(min, DEFAULT_DELAY_MIN_SEC);
  const maxSec = safe(max, DEFAULT_DELAY_MAX_SEC);
  return minSec <= maxSec ? { minSec, maxSec } : { minSec: maxSec, maxSec: minSec };
}

export function randomDelaySec(minSec: number, maxSec: number): number {
  const { minSec: lo, maxSec: hi } = clampDelayRange(minSec, maxSec);
  if (hi <= lo) return lo;
  return lo + Math.floor(Math.random() * (hi - lo + 1));
}

export function averageDelaySec(minSec: number, maxSec: number): number {
  const { minSec: lo, maxSec: hi } = clampDelayRange(minSec, maxSec);
  return Math.round((lo + hi) / 2);
}

export function providerConfigFrom(config: MailerConfig | ProviderConfig): ProviderConfig {
  return {
    mode: config.mode,
    senderName: (config.senderName ?? "").trim(),
    senderEmail: (config.senderEmail ?? "").trim(),
    replyTo: (config.replyTo ?? "").trim(),
    smtpHost: (config.smtpHost ?? "").trim(),
    smtpPort: (config.smtpPort ?? "").trim() || GMAIL_SMTP_PORT,
    smtpUser: (config.smtpUser ?? "").trim(),
    smtpPass: (config.smtpPass ?? "").trim(),
    appPassword: (config.appPassword ?? "").trim(),
    resendKey: (config.resendKey ?? "").trim(),
    sendgridKey: (config.sendgridKey ?? "").trim(),
  };
}

function readString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function parseProviderConfig(payload: unknown): ProviderConfig {
  const raw = (payload && typeof payload === "object" ? payload : {}) as Record<string, unknown>;
  return {
    mode: isMailerMode(raw.mode) ? raw.mode : "simulated",
    senderName: readString(raw.senderName),
    senderEmail: readString(raw.senderEmail),
    replyTo: readString(raw.replyTo),
    smtpHost: readString(raw.smtpHost),
    smtpPort: readString(raw.smtpPort) || GMAIL_SMTP_PORT,
    smtpUser: readString(raw.smtpUser),
    smtpPass: readString(raw.smtpPass),
    appPassword: readString(raw.appPassword),
    resendKey: readString(raw.resendKey),
    sendgridKey: readString(raw.sendgridKey),
  };
}

export function deterministicHash(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (Math.imul(hash, 31) + value.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}
