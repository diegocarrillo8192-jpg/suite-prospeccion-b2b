export const EXCLUDED_DOMAINS: readonly string[] = [
  "bing.com",
  "duckduckgo.com",
  "microsoft.com",
  "google.com",
  "googleusercontent.com",
  "gstatic.com",
  "facebook.com",
  "instagram.com",
  "youtube.com",
  "twitter.com",
  "x.com",
  "linkedin.com",
  "tiktok.com",
  "pinterest.com",
  "yelp.com",
  "wikipedia.org",
  "foursquare.com",
  "yellowpages.com",
  "tripadvisor.com",
  "opentable.com",
  "zonebourse.com",
  "yahoo.com",
  "degustapanama.com",
];

export function hostnameOf(value: string): string {
  const raw = (value ?? "").trim();
  if (!raw) return "";
  try {
    const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    return url.hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

export function isExcludedDomain(value: string): boolean {
  const host = hostnameOf(value);
  if (!host) return false;
  return EXCLUDED_DOMAINS.some((domain) => host === domain || host.endsWith(`.${domain}`));
}

export function isAllowedWebsite(value: string): boolean {
  const host = hostnameOf(value);
  if (!host) return false;
  return !isExcludedDomain(host);
}

export function filterProspectsByDomain<T extends { website: string }>(prospects: T[]): T[] {
  return prospects.filter((prospect) => !prospect.website || isAllowedWebsite(prospect.website));
}
