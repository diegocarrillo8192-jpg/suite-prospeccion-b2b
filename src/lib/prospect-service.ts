import { extractProspects, type ExtractionMeta } from "./extract";
import { extractWithApify } from "./engines/apify";
import { extractWithGooglePlaces } from "./engines/google-places";
import { filterProspectsByDomain } from "./engines/domains";
import {
  ExtractionError,
  type EngineId,
  type EngineRequest,
  type EngineResult,
  type EngineRunner,
} from "./engines/engine";

export { ExtractionError };
export type { EngineId, EngineResult, ExtractionMeta };

export interface EngineKeys {
  apifyToken: string;
  apifyActor: string;
  googleKey: string;
}

async function runFree(request: EngineRequest): Promise<EngineResult> {
  return extractProspects(request.niche || "negocios", request.city, request.limit);
}

const RUNNERS: Record<EngineId, EngineRunner> = {
  free: runFree,
  apify: extractWithApify,
  google: extractWithGooglePlaces,
};

export function isEngineId(value: unknown): value is EngineId {
  return value === "free" || value === "apify" || value === "google";
}

export async function extractProspectsWithEngine(input: {
  engine: EngineId;
  niche: string;
  city: string;
  limit: number;
  keys: EngineKeys;
}): Promise<EngineResult> {
  const runner = RUNNERS[input.engine] ?? RUNNERS.free;
  const result = await runner({
    niche: input.niche,
    city: input.city,
    limit: input.limit,
    apifyToken: input.keys.apifyToken,
    apifyActor: input.keys.apifyActor,
    googleKey: input.keys.googleKey,
  });
  return { ...result, prospects: filterProspectsByDomain(result.prospects) };
}
