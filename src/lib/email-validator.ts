import type { EmailValidation, EmailValidationStatus } from "./types";

const EMAIL_RE =
  /^(?=.{1,254}$)(?=.{1,64}@)[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,63}$/;

const DISPOSABLE_DOMAINS = new Set([
  "10minutemail.com",
  "10minutemail.net",
  "20minutemail.com",
  "33mail.com",
  "discard.email",
  "dispostable.com",
  "emailondeck.com",
  "fakeinbox.com",
  "getairmail.com",
  "getnada.com",
  "grr.la",
  "guerrillamail.biz",
  "guerrillamail.com",
  "guerrillamail.de",
  "guerrillamail.info",
  "guerrillamail.net",
  "guerrillamail.org",
  "guerrillamailblock.com",
  "harakirimail.com",
  "inboxbear.com",
  "mailcatch.com",
  "maildrop.cc",
  "mailinator.com",
  "mailnesia.com",
  "mailsac.com",
  "mintemail.com",
  "moakt.com",
  "mohmal.com",
  "mytemp.email",
  "sharklasers.com",
  "spam4.me",
  "spamgourmet.com",
  "temp-mail.io",
  "temp-mail.org",
  "tempail.com",
  "tempr.email",
  "tempmail.com",
  "tempmail.net",
  "tempmailo.com",
  "thankyou2010.com",
  "throwawaymail.com",
  "trashmail.com",
  "trashmail.de",
  "yopmail.com",
  "yopmail.fr",
  "yopmail.net",
]);

export function isValidEmailSyntax(raw: string): boolean {
  const email = (raw ?? "").trim();
  if (!email || email.includes("..")) return false;
  const at = email.lastIndexOf("@");
  if (at <= 0 || at === email.length - 1) return false;
  const domain = email.slice(at + 1);
  if (domain.startsWith("-") || domain.endsWith("-")) return false;
  return EMAIL_RE.test(email);
}

export function isDisposableDomain(domain: string): boolean {
  const d = (domain ?? "").trim().toLowerCase();
  if (!d) return false;
  if (DISPOSABLE_DOMAINS.has(d)) return true;
  for (const known of DISPOSABLE_DOMAINS) {
    if (d.endsWith(`.${known}`)) return true;
  }
  return false;
}

interface DomainCheck {
  hasMx: boolean;
  active: boolean;
  mx: string[];
}

const domainCache = new Map<string, Promise<DomainCheck>>();

async function checkDomain(domain: string): Promise<DomainCheck> {
  const cached = domainCache.get(domain);
  if (cached) return cached;

  const pending = (async (): Promise<DomainCheck> => {
    try {
      const dns = await import("node:dns/promises");
      const records = await dns.resolveMx(domain).catch(() => []);
      const mx = records
        .filter((r) => typeof r.exchange === "string" && r.exchange.length > 0)
        .map((r) => r.exchange);
      if (mx.length > 0) return { hasMx: true, active: true, mx };

      const [ipv4, ipv6] = await Promise.all([
        dns.resolve4(domain).catch(() => [] as string[]),
        dns.resolve6(domain).catch(() => [] as string[]),
      ]);
      return { hasMx: false, active: ipv4.length > 0 || ipv6.length > 0, mx: [] };
    } catch {
      return { hasMx: false, active: false, mx: [] };
    }
  })();

  domainCache.set(domain, pending);
  return pending;
}

function build(
  email: string,
  domain: string,
  status: EmailValidationStatus,
  reason: string,
  extra?: Partial<Pick<EmailValidation, "hasMx" | "disposable" | "mxRecords">>
): EmailValidation {
  const labels: Record<EmailValidationStatus, string> = {
    valid: "Válido (MX)",
    risky: "Riesgoso (Disposable/Temporal)",
    invalid: "Inválido",
    unknown: "Sin verificar",
  };
  return {
    email,
    domain,
    status,
    label: labels[status],
    reason,
    hasMx: extra?.hasMx ?? false,
    disposable: extra?.disposable ?? false,
    mxRecords: extra?.mxRecords ?? [],
  };
}

export async function validateEmail(raw: string): Promise<EmailValidation> {
  const email = (raw ?? "").trim().toLowerCase();
  if (!email) return build("", "", "unknown", "Sin correo para verificar");

  if (!isValidEmailSyntax(email)) {
    return build(email, email.split("@")[1] ?? "", "invalid", "Sintaxis de correo inválida");
  }

  const domain = email.slice(email.lastIndexOf("@") + 1);

  if (isDisposableDomain(domain)) {
    return build(email, domain, "risky", "Dominio temporal o desechable", {
      disposable: true,
    });
  }

  const check = await checkDomain(domain);
  if (check.hasMx) {
    return build(email, domain, "valid", "Dominio con registros MX activos", {
      hasMx: true,
      mxRecords: check.mx,
    });
  }
  if (check.active) {
    return build(email, domain, "risky", "Dominio activo sin registros MX", {
      mxRecords: [],
    });
  }
  return build(email, domain, "invalid", "El dominio no está registrado o no está activo");
}

export function pickBestEmail(emails: string[]): string {
  const unique: string[] = [];
  const seen = new Set<string>();
  for (const candidate of emails) {
    const email = (candidate ?? "").trim().toLowerCase();
    if (!email || seen.has(email)) continue;
    seen.add(email);
    unique.push(email);
  }
  if (unique.length === 0) return "";
  const preferred = ["contacto", "contact", "info", "ventas", "comercial", "hola", "admin", "hello"];
  for (const prefix of preferred) {
    const hit = unique.find((email) => email.startsWith(prefix));
    if (hit) return hit;
  }
  return unique[0];
}

export async function validateEmails(
  emails: string[],
  concurrency = 6
): Promise<Map<string, EmailValidation>> {
  const unique = Array.from(new Set(emails.map((e) => (e ?? "").trim().toLowerCase()).filter(Boolean)));
  const results = new Map<string, EmailValidation>();
  let next = 0;

  const worker = async (): Promise<void> => {
    while (next < unique.length) {
      const i = next++;
      const email = unique[i];
      results.set(email, await validateEmail(email));
    }
  };

  const workers = Array.from({ length: Math.max(1, Math.min(concurrency, unique.length)) }, worker);
  await Promise.all(workers);
  return results;
}
