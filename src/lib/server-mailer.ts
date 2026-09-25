import nodemailer, { type Transporter } from "nodemailer";
import {
  GMAIL_SMTP_HOST,
  GMAIL_SMTP_PORT,
  mailerModeLabel,
  type ProviderConfig,
} from "./email-providers";

export interface OutgoingEmail {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export interface DeliveryResult {
  success: boolean;
  provider: string;
  id?: string;
  message?: string;
}

interface SmtpSettings {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
}

function fromAddress(config: ProviderConfig): string {
  const name = config.senderName.trim();
  return name ? `${name} <${config.senderEmail}>` : config.senderEmail;
}

function replyToAddress(config: ProviderConfig): string {
  return config.replyTo.trim() || config.senderEmail.trim();
}

function resolveSmtp(config: ProviderConfig): SmtpSettings {
  if (config.mode === "gmail") {
    return {
      host: GMAIL_SMTP_HOST,
      port: Number(GMAIL_SMTP_PORT),
      secure: false,
      user: config.senderEmail,
      pass: config.appPassword,
    };
  }
  const port = Number(config.smtpPort) || 587;
  return {
    host: config.smtpHost,
    port,
    secure: port === 465,
    user: config.smtpUser || config.senderEmail,
    pass: config.smtpPass,
  };
}

function createTransport(config: ProviderConfig): Transporter | null {
  if (config.mode !== "gmail" && config.mode !== "smtp") return null;
  const smtp = resolveSmtp(config);
  if (!smtp.host) return null;
  return nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    auth: smtp.user ? { user: smtp.user, pass: smtp.pass } : undefined,
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
  });
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return "No se pudo completar la operación con el proveedor.";
}

async function readApiError(response: Response): Promise<string> {
  try {
    const data = (await response.json()) as Record<string, unknown>;
    const message =
      (typeof data.message === "string" && data.message) ||
      (typeof data.error === "string" && data.error) ||
      (Array.isArray(data.errors) &&
        typeof (data.errors[0] as Record<string, unknown>)?.message === "string" &&
        String((data.errors[0] as Record<string, unknown>).message));
    if (message) return message;
  } catch {
    // respuesta sin cuerpo JSON
  }
  return `El proveedor respondió con estado ${response.status}.`;
}

async function verifyResend(config: ProviderConfig): Promise<DeliveryResult> {
  const provider = mailerModeLabel(config.mode);
  if (!config.resendKey) {
    return { success: false, provider, message: "Falta la API Key de Resend." };
  }
  try {
    const res = await fetch("https://api.resend.com/domains", {
      headers: { Authorization: `Bearer ${config.resendKey}` },
    });
    if (!res.ok) return { success: false, provider, message: await readApiError(res) };
    return { success: true, provider, message: "Conexión con Resend verificada." };
  } catch (error) {
    return { success: false, provider, message: errorMessage(error) };
  }
}

async function verifySendGrid(config: ProviderConfig): Promise<DeliveryResult> {
  const provider = mailerModeLabel(config.mode);
  if (!config.sendgridKey) {
    return { success: false, provider, message: "Falta la API Key de SendGrid." };
  }
  try {
    const res = await fetch("https://api.sendgrid.com/v3/scopes", {
      headers: { Authorization: `Bearer ${config.sendgridKey}` },
    });
    if (!res.ok) return { success: false, provider, message: await readApiError(res) };
    return { success: true, provider, message: "Conexión con SendGrid verificada." };
  } catch (error) {
    return { success: false, provider, message: errorMessage(error) };
  }
}

export async function verifyConnection(config: ProviderConfig): Promise<DeliveryResult> {
  const provider = mailerModeLabel(config.mode);

  if (config.mode === "simulated") {
    return { success: true, provider, message: "Modo simulado activo: no requiere credenciales." };
  }
  if (!config.senderEmail) {
    return { success: false, provider, message: "Define un correo remitente válido." };
  }
  if (config.mode === "resend") return verifyResend(config);
  if (config.mode === "sendgrid") return verifySendGrid(config);

  const transport = createTransport(config);
  if (!transport) {
    return { success: false, provider, message: "Configuración SMTP incompleta." };
  }
  try {
    await transport.verify();
    return { success: true, provider, message: "Conexión SMTP verificada." };
  } catch (error) {
    return { success: false, provider, message: errorMessage(error) };
  } finally {
    transport.close?.();
  }
}

async function sendViaResend(
  config: ProviderConfig,
  email: OutgoingEmail
): Promise<DeliveryResult> {
  const provider = mailerModeLabel(config.mode);
  if (!config.resendKey) {
    return { success: false, provider, message: "Falta la API Key de Resend." };
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromAddress(config),
        to: [email.to],
        subject: email.subject,
        html: email.html,
        text: email.text,
        reply_to: replyToAddress(config),
      }),
    });
    if (!res.ok) return { success: false, provider, message: await readApiError(res) };
    const data = (await res.json().catch(() => ({}))) as { id?: string };
    return { success: true, provider, id: data.id };
  } catch (error) {
    return { success: false, provider, message: errorMessage(error) };
  }
}

async function sendViaSendGrid(
  config: ProviderConfig,
  email: OutgoingEmail
): Promise<DeliveryResult> {
  const provider = mailerModeLabel(config.mode);
  if (!config.sendgridKey) {
    return { success: false, provider, message: "Falta la API Key de SendGrid." };
  }
  try {
    const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.sendgridKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: email.to }] }],
        from: {
          email: config.senderEmail,
          name: config.senderName.trim() || undefined,
        },
        reply_to: { email: replyToAddress(config) },
        subject: email.subject,
        content: [{ type: "text/html", value: email.html }],
      }),
    });
    if (!res.ok) return { success: false, provider, message: await readApiError(res) };
    return { success: true, provider, id: res.headers.get("x-message-id") ?? undefined };
  } catch (error) {
    return { success: false, provider, message: errorMessage(error) };
  }
}

export async function sendEmail(
  config: ProviderConfig,
  email: OutgoingEmail
): Promise<DeliveryResult> {
  const provider = mailerModeLabel(config.mode);

  if (config.mode === "simulated") {
    return { success: true, provider, id: `sim_${Date.now()}` };
  }
  if (config.mode === "resend") return sendViaResend(config, email);
  if (config.mode === "sendgrid") return sendViaSendGrid(config, email);

  const transport = createTransport(config);
  if (!transport) {
    return { success: false, provider, message: "Configuración SMTP incompleta." };
  }
  try {
    const info = await transport.sendMail({
      from: fromAddress(config),
      to: email.to,
      replyTo: replyToAddress(config),
      subject: email.subject,
      html: email.html,
      text: email.text,
    });
    return { success: true, provider, id: info.messageId };
  } catch (error) {
    return { success: false, provider, message: errorMessage(error) };
  } finally {
    transport.close?.();
  }
}
