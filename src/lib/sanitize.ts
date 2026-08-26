const SCRIPT_RE = /<script[\s\S]*?>[\s\S]*?<\/script>/gi;
const EVENT_RE = /\son\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi;
const JS_URL_RE = /(href|src)\s*=\s*(?:"javascript:[^"]*"|'javascript:[^']*'|javascript:[^\s>]+)/gi;
const TAG_RE = /<[^>]*>/g;

export function sanitizeHtml(input: string): string {
  return input
    .replace(SCRIPT_RE, "")
    .replace(EVENT_RE, "")
    .replace(JS_URL_RE, '$1="#"');
}

export function sanitizeText(input: string): string {
  return input
    .replace(SCRIPT_RE, "")
    .replace(TAG_RE, "")
    .replace(/[<>]/g, "")
    .trim();
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function isValidEmail(email: string): boolean {
  return EMAIL_RE.test(email.trim());
}
