export type TechCategory = "cms" | "analytics" | "ecommerce" | "infrastructure";

export interface DetectedTech {
  id: string;
  name: string;
  category: TechCategory;
}

export type OpportunityLevel = "alta" | "media" | "baja";

export interface WebOpportunity {
  level: OpportunityLevel;
  score: number;
  label: string;
  reasons: string[];
}

export interface TechStack {
  detected: DetectedTech[];
  ssl: boolean;
  server: string | null;
  analyzed: boolean;
  opportunity: WebOpportunity;
}

export interface TechDetectionInput {
  html?: string;
  headers?: Record<string, string>;
  url?: string;
}

interface HeaderRule {
  name: string;
  pattern: RegExp;
}

interface TechSignature {
  tech: DetectedTech;
  html?: RegExp;
  headers?: HeaderRule[];
}

const CMS_IDS = new Set(["wordpress", "shopify", "wix", "squarespace", "webflow"]);
const CLOSED_PLATFORM_IDS = new Set(["wix", "squarespace", "webflow"]);

const SIGNATURES: TechSignature[] = [
  // CMS / Frameworks
  {
    tech: { id: "wordpress", name: "WordPress", category: "cms" },
    html: /(wp-content|wp-includes|wp-json|\/wp-admin|wp-emoji)/i,
    headers: [{ name: "link", pattern: /wp-json|wordpress\.org/i }],
  },
  {
    tech: { id: "shopify", name: "Shopify", category: "cms" },
    html: /(cdn\.shopify\.com|shopifycdn|shopify\.theme|shopify-section)/i,
    headers: [
      { name: "x-shopify-stage", pattern: /./ },
      { name: "x-shopid", pattern: /./ },
      { name: "x-powered-by", pattern: /shopify/i },
    ],
  },
  {
    tech: { id: "wix", name: "Wix", category: "cms" },
    html: /(static\.parastorage\.com|wixstatic\.com|wix-code|wix\.com\/website)/i,
    headers: [
      { name: "x-wix-request-id", pattern: /./ },
      { name: "x-wix-renderer-server", pattern: /./ },
    ],
  },
  {
    tech: { id: "squarespace", name: "Squarespace", category: "cms" },
    html: /(static1\.squarespace\.com|squarespace\.com|sqsp\.net|squarespace-cdn)/i,
    headers: [{ name: "x-contextid", pattern: /./ }],
  },
  {
    tech: { id: "webflow", name: "Webflow", category: "cms" },
    html: /(assets\.website-files\.com|webflow\.com|data-wf-page|data-wf-site|data-wf-ignore)/i,
    headers: [{ name: "x-wf-request-id", pattern: /./ }],
  },
  {
    tech: { id: "nextjs", name: "Next.js", category: "cms" },
    html: /(__NEXT_DATA__|\/_next\/static|\/_next\/image|\/_next\/chunk)/i,
    headers: [
      { name: "x-powered-by", pattern: /next\.js/i },
      { name: "x-nextjs-cache", pattern: /./ },
    ],
  },
  {
    tech: { id: "laravel", name: "Laravel", category: "cms" },
    html: /(laravel_session|laravel-|csrf-token"[^>]*laravel)/i,
    headers: [
      { name: "set-cookie", pattern: /(laravel_session|xsrf-token)/i },
      { name: "x-powered-by", pattern: /laravel/i },
    ],
  },
  // Analytics / Marketing
  {
    tech: { id: "ga4", name: "Google Analytics (GA4)", category: "analytics" },
    html: /(googletagmanager\.com\/gtag|gtag\/js\?id=g-|google-analytics\.com\/analytics\.js|['"]g-[a-z0-9]{6,}['"])/i,
  },
  {
    tech: { id: "gtm", name: "Google Tag Manager", category: "analytics" },
    html: /(googletagmanager\.com\/gtm\.js|['"]gtm-[a-z0-9]+['"]|gtm\.js\?id=gtm-)/i,
  },
  {
    tech: { id: "meta-pixel", name: "Meta Pixel", category: "analytics" },
    html: /(connect\.facebook\.net|fbevents\.js|fbq\s*\()/i,
  },
  {
    tech: { id: "hotjar", name: "Hotjar", category: "analytics" },
    html: /(static\.hotjar\.com|hotjar\.com\/|hj\s*\(|hjid)/i,
  },
  // E-commerce / Pagos
  {
    tech: { id: "woocommerce", name: "WooCommerce", category: "ecommerce" },
    html: /(wp-content\/plugins\/woocommerce|woocommerce|wc-ajax|add-to-cart)/i,
  },
  {
    tech: { id: "shopify-checkout", name: "Shopify Checkout", category: "ecommerce" },
    html: /(checkout\.shopify\.com|\/checkouts\/|shopifycloud\/checkout-web)/i,
  },
  {
    tech: { id: "stripe", name: "Stripe", category: "ecommerce" },
    html: /(js\.stripe\.com|stripe\.com\/v3|data-stripe|stripe\.js)/i,
  },
  {
    tech: { id: "paypal", name: "PayPal", category: "ecommerce" },
    html: /(paypal\.com\/sdk\/js|paypalobjects\.com|paypal\.com\/cgi-bin|paypal\.me\/)/i,
  },
];

function matchesSignature(
  signature: TechSignature,
  html: string,
  headers: Record<string, string>
): boolean {
  if (signature.html && signature.html.test(html)) return true;
  if (!signature.headers) return false;
  return signature.headers.some((rule) => {
    const value = headers[rule.name];
    return typeof value === "string" && rule.pattern.test(value);
  });
}

function detectServer(headers: Record<string, string>): string | null {
  const raw = headers.server;
  if (!raw) return null;
  const value = raw.toLowerCase();
  if (value.includes("cloudflare")) return "Cloudflare";
  if (value.includes("nginx")) return "Nginx";
  if (value.includes("litespeed")) return "LiteSpeed";
  if (value.includes("apache")) return "Apache";
  if (value.includes("iis") || value.includes("microsoft")) return "IIS";
  return null;
}

function hasCloudflare(headers: Record<string, string>, html: string): boolean {
  if (headers["cf-ray"] || headers["cf-cache-status"]) return true;
  if (headers.server && /cloudflare/i.test(headers.server)) return true;
  return /cdn-cgi\/challenge-platform|cloudflare\.com\/cdn-cgi/i.test(html);
}

function detectSsl(url: string | undefined): boolean {
  if (!url) return false;
  try {
    return new URL(url).protocol === "https:";
  } catch {
    return false;
  }
}

export function assessOpportunity(detected: DetectedTech[], ssl: boolean): WebOpportunity {
  const ids = new Set(detected.map((tech) => tech.id));
  const hasGA = ids.has("ga4") || ids.has("gtm");
  const hasGtm = ids.has("gtm");
  const hasPixel = ids.has("meta-pixel");
  const hasCms = Array.from(CMS_IDS).some((id) => ids.has(id));
  const hasClosedPlatform = Array.from(CLOSED_PLATFORM_IDS).some((id) => ids.has(id));

  const reasons: string[] = [];
  let score = 0;

  if (!ssl) {
    score += 45;
    reasons.push("Sitio sin HTTPS/SSL: riesgo de seguridad y penalización SEO.");
  }
  if (!hasPixel) {
    score += 15;
    reasons.push("Sin Meta Pixel: no mide conversiones en Facebook/Instagram.");
  }
  if (!hasGA) {
    score += 15;
    reasons.push("Sin analítica web (GA4/GTM): no hay datos para tomar decisiones.");
  }
  if (!hasCms) {
    score += 10;
    reasons.push("Sin CMS moderno detectado: difícil gestionar contenidos sin desarrollador.");
  }
  if (ids.has("wordpress") && !hasGtm) {
    score += 10;
    reasons.push("WordPress sin Google Tag Manager: seguimiento y campañas limitados.");
  }
  if (hasClosedPlatform) {
    score += 15;
    reasons.push("Plataforma cerrada (Wix/Squarespace/Webflow): poca flexibilidad para escalar.");
  }

  score = Math.min(100, score);
  const level: OpportunityLevel = score >= 55 ? "alta" : score >= 25 ? "media" : "baja";
  const label =
    level === "alta"
      ? "Oportunidad alta"
      : level === "media"
        ? "Oportunidad media"
        : "Oportunidad baja";

  return { level, score, label, reasons };
}

export function detectTechStack(input: TechDetectionInput): TechStack {
  const html = input.html ?? "";
  const headers = input.headers ?? {};
  const ssl = detectSsl(input.url);

  const detected: DetectedTech[] = [];
  const seen = new Set<string>();
  const add = (tech: DetectedTech) => {
    if (seen.has(tech.id)) return;
    seen.add(tech.id);
    detected.push(tech);
  };

  for (const signature of SIGNATURES) {
    if (matchesSignature(signature, html, headers)) add(signature.tech);
  }

  const server = detectServer(headers);
  if (server) add({ id: `server-${server.toLowerCase()}`, name: server, category: "infrastructure" });
  if (hasCloudflare(headers, html)) {
    add({ id: "cloudflare", name: "Cloudflare", category: "infrastructure" });
  }
  if (ssl) add({ id: "ssl", name: "SSL/HTTPS", category: "infrastructure" });

  return { detected, ssl, server, analyzed: true, opportunity: assessOpportunity(detected, ssl) };
}

export function emptyTechStack(): TechStack {
  return {
    detected: [],
    ssl: false,
    server: null,
    analyzed: false,
    opportunity: { level: "baja", score: 0, label: "Sin análisis", reasons: [] },
  };
}
