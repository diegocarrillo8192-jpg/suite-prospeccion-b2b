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

const CCTLD_TO_COUNTRY: Record<string, string> = {
  ae: "AE",
  ar: "AR",
  at: "AT",
  au: "AU",
  be: "BE",
  bo: "BO",
  br: "BR",
  bz: "BZ",
  ca: "CA",
  ch: "CH",
  cl: "CL",
  cn: "CN",
  co: "CO",
  cr: "CR",
  cu: "CU",
  cz: "CZ",
  de: "DE",
  dk: "DK",
  do: "DO",
  ec: "EC",
  eg: "EG",
  es: "ES",
  fi: "FI",
  fr: "FR",
  gb: "GB",
  gr: "GR",
  gt: "GT",
  hn: "HN",
  hu: "HU",
  id: "ID",
  ie: "IE",
  il: "IL",
  in: "IN",
  it: "IT",
  jp: "JP",
  kr: "KR",
  ma: "MA",
  mx: "MX",
  my: "MY",
  ng: "NG",
  ni: "NI",
  nl: "NL",
  no: "NO",
  nz: "NZ",
  pa: "PA",
  pe: "PE",
  ph: "PH",
  pl: "PL",
  pr: "PR",
  pt: "PT",
  py: "PY",
  ro: "RO",
  ru: "RU",
  sa: "SA",
  se: "SE",
  sg: "SG",
  sv: "SV",
  th: "TH",
  tr: "TR",
  tw: "TW",
  ua: "UA",
  uk: "GB",
  us: "US",
  uy: "UY",
  ve: "VE",
  vn: "VN",
  za: "ZA",
};

const GENERIC_SECOND_LEVEL = new Set([
  "com",
  "net",
  "org",
  "co",
  "gob",
  "gov",
  "edu",
  "mil",
  "ac",
  "web",
  "info",
  "biz",
]);

export function countryOfHost(host: string): string {
  const parts = (host ?? "").toLowerCase().split(".").filter(Boolean);
  if (parts.length < 2) return "";
  const tld = parts[parts.length - 1];
  if (parts.length >= 3 && GENERIC_SECOND_LEVEL.has(parts[parts.length - 2])) {
    return CCTLD_TO_COUNTRY[tld] ?? "";
  }
  return CCTLD_TO_COUNTRY[tld] ?? "";
}

export function isForeignTld(host: string, countryCode: string): boolean {
  const target = (countryCode ?? "").trim().toUpperCase();
  if (!target || !host) return false;
  const tldCountry = countryOfHost(host);
  return tldCountry !== "" && tldCountry !== target;
}

export function filterProspectsByDomain<T extends { website: string }>(prospects: T[]): T[] {
  return prospects.filter((prospect) => !prospect.website || isAllowedWebsite(prospect.website));
}
