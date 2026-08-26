const STORAGE_KEY = "b2b.smtp.credentials";
const SALT_TEXT = "suite-prospeccion-b2b::v1";

export interface SmtpCredentials {
  host: string;
  port: string;
  user: string;
  pass: string;
}

async function deriveKey(secret: string): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const material = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: enc.encode(SALT_TEXT), iterations: 150000, hash: "SHA-256" },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

export async function encryptCredentials(
  creds: SmtpCredentials,
  passphrase: string
): Promise<string> {
  const key = await deriveKey(passphrase);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const enc = new TextEncoder();
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    enc.encode(JSON.stringify(creds))
  );
  const buf = new Uint8Array(iv.length + ct.byteLength);
  buf.set(iv, 0);
  buf.set(new Uint8Array(ct), iv.length);
  return btoa(String.fromCharCode(...buf));
}

export async function decryptCredentials(
  blob: string,
  passphrase: string
): Promise<SmtpCredentials> {
  const key = await deriveKey(passphrase);
  const raw = Uint8Array.from(atob(blob), (c) => c.charCodeAt(0));
  const iv = raw.slice(0, 12);
  const ct = raw.slice(12);
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct);
  return JSON.parse(new TextDecoder().decode(pt));
}

export function saveEncryptedCredentials(blob: string): void {
  if (typeof window !== "undefined") localStorage.setItem(STORAGE_KEY, blob);
  emitChange();
}

export function loadEncryptedCredentials(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(STORAGE_KEY);
}

export function clearEncryptedCredentials(): void {
  if (typeof window !== "undefined") localStorage.removeItem(STORAGE_KEY);
  emitChange();
}

const listeners = new Set<() => void>();

function emitChange(): void {
  for (const l of listeners) l();
}

export function subscribeCredentials(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getCredentialsSnapshot(): string | null {
  return loadEncryptedCredentials();
}
