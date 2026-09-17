import type { EmailValidation, EmailValidationStatus } from "../types";

export interface ValidateEmailOptions {
  probeCatchAll?: boolean;
  timeoutMs?: number;
}

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
  if (domain.startsWith(".") || domain.endsWith(".")) return false;
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
        .sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0))
        .map((r) => r.exchange.replace(/\.$/, ""));
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

type SmtpStep = "greeting" | "ehlo" | "helo" | "mail" | "rcpt";

function smtpCatchAllProbe(mxHost: string, domain: string, timeoutMs: number): Promise<boolean | null> {
  return new Promise<boolean | null>((resolve) => {
    void (async () => {
      const net = await import("node:net");
      const socket = new net.Socket();
      let settled = false;
      let buffer = "";
      let step: SmtpStep = "greeting";

      const finish = (value: boolean | null) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        socket.removeAllListeners();
        socket.destroy();
        resolve(value);
      };

      const timer = setTimeout(() => finish(null), timeoutMs);

      const write = (line: string) => {
        if (settled) return;
        socket.write(`${line}\r\n`, () => undefined);
      };

      const probeAddress = `probe-${Date.now().toString(36)}-${Math.random()
        .toString(36)
        .slice(2, 8)}@${domain}`;

      const onReply = (code: number) => {
        switch (step) {
          case "greeting":
            if (code !== 220) return finish(null);
            step = "ehlo";
            write("EHLO validator.local");
            return;
          case "ehlo":
            if (code >= 200 && code < 300) {
              step = "mail";
              write("MAIL FROM:<>");
              return;
            }
            step = "helo";
            write("HELO validator.local");
            return;
          case "helo":
            if (code >= 200 && code < 300) {
              step = "mail";
              write("MAIL FROM:<>");
              return;
            }
            return finish(null);
          case "mail":
            if (code >= 200 && code < 300) {
              step = "rcpt";
              write(`RCPT TO:<${probeAddress}>`);
              return;
            }
            return finish(null);
          case "rcpt":
            if (code === 250 || code === 251) return finish(true);
            if ([501, 550, 551, 552, 553, 554].includes(code)) return finish(false);
            return finish(null);
        }
      };

      socket.setTimeout(timeoutMs);
      socket.once("timeout", () => finish(null));
      socket.once("error", () => finish(null));
      socket.on("data", (chunk: Buffer) => {
        buffer += chunk.toString("utf8");
        let index = buffer.indexOf("\n");
        while (index !== -1) {
          const rawLine = buffer.slice(0, index).replace(/\r$/, "");
          buffer = buffer.slice(index + 1);
          const match = /^(\d{3})([ -]?)/.exec(rawLine);
          if (match && (match[2] === " " || rawLine.length === 3)) {
            onReply(Number(match[1]));
          }
          index = buffer.indexOf("\n");
        }
      });
      socket.connect(25, mxHost);
    })().catch(() => resolve(null));
  });
}

const catchAllCache = new Map<string, Promise<boolean | null>>();

async function detectCatchAll(
  domain: string,
  mxHosts: string[],
  timeoutMs: number
): Promise<boolean | null> {
  const cached = catchAllCache.get(domain);
  if (cached) return cached;

  const pending = (async (): Promise<boolean | null> => {
    for (const host of mxHosts) {
      const result = await smtpCatchAllProbe(host, domain, timeoutMs);
      if (result !== null) return result;
    }
    return null;
  })();

  catchAllCache.set(domain, pending);
  return pending;
}

function labelFor(
  status: EmailValidationStatus,
  disposable: boolean,
  catchAll: boolean
): string {
  if (status === "valid") return "Válido";
  if (status === "invalid") return "Inválido";
  if (status === "risky") {
    if (disposable) return "Riesgoso (Desechable)";
    if (catchAll) return "Riesgoso (Catch-all)";
    return "Riesgoso";
  }
  return "Sin verificar";
}

function build(
  email: string,
  domain: string,
  status: EmailValidationStatus,
  reason: string,
  extra?: Partial<Pick<EmailValidation, "hasMx" | "disposable" | "catchAll" | "mxRecords">>
): EmailValidation {
  const disposable = extra?.disposable ?? false;
  const catchAll = extra?.catchAll ?? false;
  return {
    email,
    domain,
    status,
    label: labelFor(status, disposable, catchAll),
    reason,
    hasMx: extra?.hasMx ?? false,
    disposable,
    catchAll,
    mxRecords: extra?.mxRecords ?? [],
  };
}

export async function validateEmail(
  raw: string,
  options: ValidateEmailOptions = {}
): Promise<EmailValidation> {
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
  if (!check.hasMx) {
    if (check.active) {
      return build(email, domain, "risky", "Dominio activo sin registros MX");
    }
    return build(email, domain, "invalid", "El dominio no está registrado o no está activo");
  }

  if (options.probeCatchAll) {
    const catchAll = await detectCatchAll(domain, check.mx, options.timeoutMs ?? 6000);
    if (catchAll === true) {
      return build(email, domain, "risky", "El dominio acepta cualquier correo (catch-all)", {
        hasMx: true,
        catchAll: true,
        mxRecords: check.mx,
      });
    }
  }

  return build(email, domain, "valid", "Dominio con registros MX activos", {
    hasMx: true,
    mxRecords: check.mx,
  });
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
  concurrency = 6,
  options: ValidateEmailOptions = {}
): Promise<Map<string, EmailValidation>> {
  const unique = Array.from(
    new Set(emails.map((e) => (e ?? "").trim().toLowerCase()).filter(Boolean))
  );
  const results = new Map<string, EmailValidation>();
  let next = 0;

  const worker = async (): Promise<void> => {
    while (next < unique.length) {
      const i = next++;
      const email = unique[i];
      results.set(email, await validateEmail(email, options));
    }
  };

  const workers = Array.from(
    { length: Math.max(1, Math.min(concurrency, unique.length)) },
    worker
  );
  await Promise.all(workers);
  return results;
}
