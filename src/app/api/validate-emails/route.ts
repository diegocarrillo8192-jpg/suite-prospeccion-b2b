import { NextRequest, NextResponse } from "next/server";
import { validateEmails } from "@/lib/validators/email-validator";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_ITEMS = 250;
const MAX_CATCHALL_DOMAINS = 30;

interface ValidateItem {
  id: string;
  correo: string;
}

function readItem(value: unknown): ValidateItem | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const id = typeof record.id === "string" ? record.id.slice(0, 120) : "";
  if (!id) return null;
  const correo = typeof record.correo === "string" ? record.correo.trim().slice(0, 320) : "";
  return { id, correo };
}

function domainOf(email: string): string {
  const at = email.lastIndexOf("@");
  return at === -1 ? "" : email.slice(at + 1).toLowerCase();
}

export async function POST(request: NextRequest) {
  const forwarded = request.headers.get("x-forwarded-for") ?? "";
  const ip = forwarded.split(",")[0]?.trim() || "local";

  const rl = rateLimit(ip, { capacity: 20, refillAmount: 1, refillPerMs: 800 });
  if (!rl.ok) {
    return NextResponse.json(
      {
        success: false,
        error: "rate_limited",
        message: "Demasiadas validaciones seguidas. Espera un momento.",
        retryAfter: rl.retryAfter,
      },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } }
    );
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: "invalid_json" }, { status: 400 });
  }

  const body = (payload && typeof payload === "object" ? payload : {}) as Record<string, unknown>;
  const rawItems = Array.isArray(body.items) ? body.items.slice(0, MAX_ITEMS) : [];
  const deep = body.deep !== false;

  const items = rawItems.map(readItem).filter((item): item is ValidateItem => item !== null);
  if (items.length === 0) {
    return NextResponse.json(
      {
        success: false,
        error: "missing_items",
        message: "Envía al menos un prospecto con correo para validar.",
      },
      { status: 400 }
    );
  }

  const deepDomains = new Set<string>();
  if (deep) {
    for (const item of items) {
      const domain = domainOf(item.correo);
      if (!domain || deepDomains.has(domain)) continue;
      if (deepDomains.size >= MAX_CATCHALL_DOMAINS) break;
      deepDomains.add(domain);
    }
  }

  const deepEmails: string[] = [];
  const shallowEmails: string[] = [];
  for (const item of items) {
    if (!item.correo) continue;
    if (deepDomains.has(domainOf(item.correo))) deepEmails.push(item.correo);
    else shallowEmails.push(item.correo);
  }

  const [deepResults, shallowResults] = await Promise.all([
    validateEmails(deepEmails, 6, { probeCatchAll: deep, timeoutMs: 3500 }),
    validateEmails(shallowEmails, 12),
  ]);

  const results = items.map((item) => {
    const key = item.correo.trim().toLowerCase();
    const validation = deepResults.get(key) ?? shallowResults.get(key);
    return {
      id: item.id,
      emailStatus: validation?.status ?? "unknown",
      emailStatusLabel: validation?.label ?? "Sin verificar",
      emailReason: validation?.reason ?? "Sin correo para verificar",
      hasMx: validation?.hasMx ?? false,
      disposable: validation?.disposable ?? false,
      catchAll: validation?.catchAll ?? false,
    };
  });

  const summary = results.reduce(
    (acc, r) => {
      if (r.emailStatus === "valid") acc.valid += 1;
      else if (r.emailStatus === "risky") acc.risky += 1;
      else if (r.emailStatus === "invalid") acc.invalid += 1;
      else acc.unknown += 1;
      return acc;
    },
    { valid: 0, risky: 0, invalid: 0, unknown: 0 }
  );

  return NextResponse.json({ success: true, results, summary });
}
