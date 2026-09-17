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

  const [primary, ...rest] = phrases;
  const orPhrases = phrases.slice(0, 3);
  const query =
    orPhrases.length > 1
      ? `(${orPhrases.map((p) => `"${p}"`).join(" OR ")})`
      : `"${primary ?? location ?? topic}"`;

  return {
    query,
    phrase: primary ?? location ?? topic,
    variants: rest,
  };
}
