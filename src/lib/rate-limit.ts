import { NextResponse, type NextRequest } from "next/server";

interface Bucket {
  tokens: number;
  last: number;
}

const buckets = new Map<string, Bucket>();
const MAX_BUCKETS = 5000;

interface RateLimitResult {
  ok: boolean;
  /** Segundos a esperar antes de reintentar. */
  retryAfter: number;
}

export interface RateLimitOptions {
  capacity?: number;
  refillAmount?: number;
  refillPerMs?: number;
}

export function rateLimit(key: string, options?: RateLimitOptions): RateLimitResult {
  const capacity = options?.capacity ?? 8;
  const refillAmount = options?.refillAmount ?? 1;
  const refillPerMs = options?.refillPerMs ?? 2500;
  const now = Date.now();

  let b = buckets.get(key);
  if (!b) {
    if (buckets.size >= MAX_BUCKETS) buckets.clear();
    b = { tokens: capacity, last: now };
    buckets.set(key, b);
  }

  const elapsed = now - b.last;
  b.tokens = Math.min(capacity, b.tokens + (elapsed / refillPerMs) * refillAmount);
  b.last = now;

  if (b.tokens >= 1) {
    b.tokens -= 1;
    return { ok: true, retryAfter: 0 };
  }

  const retryAfterMs = ((1 - b.tokens) * refillPerMs) / refillAmount;
  return { ok: false, retryAfter: Math.max(1, Math.ceil(retryAfterMs / 1000)) };
}

export function clientIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for") ?? "";
  return forwarded.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "local";
}

/**
 * Aplica el límite por ruta (`scope`) e IP. Devuelve la respuesta 429 lista
 * para retornar o `null` si la solicitud puede continuar.
 */
export function limitRequest(
  request: NextRequest,
  scope: string,
  message: string,
  options?: RateLimitOptions
): NextResponse | null {
  const rl = rateLimit(`${scope}:${clientIp(request)}`, options);
  if (rl.ok) return null;
  return NextResponse.json(
    { success: false, error: "rate_limited", message, retryAfter: rl.retryAfter },
    { status: 429, headers: { "Retry-After": String(rl.retryAfter) } }
  );
}
