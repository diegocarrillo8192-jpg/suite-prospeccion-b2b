interface Bucket {
  tokens: number;
  last: number;
}

const buckets = new Map<string, Bucket>();

interface RateLimitResult {
  ok: boolean;
  retryAfter: number;
}

export function rateLimit(
  key: string,
  options?: { capacity?: number; refillAmount?: number; refillPerMs?: number }
): RateLimitResult {
  const capacity = options?.capacity ?? 8;
  const refillAmount = options?.refillAmount ?? 1;
  const refillPerMs = options?.refillPerMs ?? 2500;
  const now = Date.now();

  let b = buckets.get(key);
  if (!b) {
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

  const retryAfter = Math.ceil(((1 - b.tokens) * refillPerMs) / refillAmount);
  return { ok: false, retryAfter };
}
