export interface QueryPlan {
  query: string;
  phrase: string;
  variants: string[];
}

interface NicheSynonyms {
  test: RegExp;
  terms: string[];
}

const NICHE_SYNONYMS: NicheSynonyms[] = [
  {
    test: /dentist|odont|dental/i,
    terms: ["dentistas", "clínica dental", "consultorio dental", "odontólogos"],
  },
  {
    test: /restauran|gastronom|comida/i,
    terms: ["restaurantes", "restaurante", "comida"],
  },
  {
    test: /peluquer|barber|est[eé]tica/i,
    terms: ["peluquerías", "salón de belleza", "barberías"],
  },
  {
    test: /taller|mec[aá]nic/i,
    terms: ["talleres mecánicos", "taller de mecánica", "mecánica automotriz"],
  },
  {
    test: /cl[ií]nic|m[eé]dic|salud/i,
    terms: ["clínicas", "clínica médica", "consultorios médicos"],
  },
  {
    test: /abogad|jur[ií]dic/i,
    terms: ["abogados", "bufete de abogados", "firma de abogados"],
  },
  {
    test: /farmac|droguer|botica/i,
    terms: ["farmacias", "droguerías", "farmacia"],
  },
  {
    test: /gimnasio|fitness|crossfit/i,
    terms: ["gimnasios", "centros de entrenamiento", "gimnasio"],
  },
  {
    test: /veterinari/i,
    terms: ["veterinarias", "clínica veterinaria", "veterinarios"],
  },
];

const COUNTRY_LOCAL: Record<string, { tld: string; alt: string }> = {
  panama: { tld: "pa", alt: "Panama" },
};

function stripAccents(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function buildLocation(city: string, countryName: string): string {
  const c = city.trim();
  const country = countryName.trim();
  if (!c) return country;
  if (!country) return c;
  const cityLower = c.toLowerCase();
  if (cityLower === country.toLowerCase() || country.toLowerCase().startsWith(cityLower)) {
    return c;
  }
  return `${c}, ${country}`;
}

function countryClause(countryName: string): string {
  const name = countryName.trim();
  if (!name) return "";
  const local = COUNTRY_LOCAL[stripAccents(name).toLowerCase()];
  if (local) return `"${name}" site:.${local.tld} OR "${local.alt}"`;
  return `"${name}"`;
}

function buildWebPhrase(term: string, city: string, countryName: string): string {
  const parts = [`"${term.trim()}"`];
  const c = city.trim();
  if (c && stripAccents(c).toLowerCase() !== stripAccents(countryName).toLowerCase()) {
    parts.push(`"${c}"`);
  }
  const clause = countryClause(countryName);
  if (clause) parts.push(clause);
  return parts.join(" ");
}

export function planQueries(niche: string, city: string, countryName: string): QueryPlan {
  const topic = niche.trim() || "negocios";
  const location = buildLocation(city, countryName);
  const synonyms = NICHE_SYNONYMS.find((rule) => rule.test.test(topic))?.terms ?? [];
  const terms = [topic, ...synonyms.filter((t) => t.toLowerCase() !== topic.toLowerCase())];

  const phrases: string[] = [];
  const seen = new Set<string>();
  for (const term of terms) {
    const phrase = location ? `${term} en ${location}` : term;
    const key = phrase.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    phrases.push(phrase);
  }

  const quotedTerms = terms.slice(0, 3).map((term) => `"${term.trim()}"`);
  const termGroup =
    quotedTerms.length > 1 ? `(${quotedTerms.join(" OR ")})` : quotedTerms[0] ?? `"${topic}"`;

  const parts = [termGroup];
  const c = city.trim();
  if (c && stripAccents(c).toLowerCase() !== stripAccents(countryName).toLowerCase()) {
    parts.push(`"${c}"`);
  }
  const clause = countryClause(countryName);
  if (clause) parts.push(clause);

  return {
    query: parts.join(" "),
    phrase: phrases[0] ?? location ?? topic,
    variants: terms.slice(1, 4).map((term) => buildWebPhrase(term, city, countryName)),
  };
}
