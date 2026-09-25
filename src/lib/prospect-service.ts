import { extractWithHybrid } from "./hybrid-scraper";
import {
  ExtractionError,
  type EngineId,
  type EngineResult,
} from "./engines/engine";
import type { ExtractionMeta } from "./extract";

export { ExtractionError };
export type { EngineId, EngineResult, ExtractionMeta };

export interface EngineKeys {
  apifyToken: string;
  apifyActor: string;
  googleKey: string;
}

export function isEngineId(value: unknown): value is EngineId {
  return value === "free" || value === "apify" || value === "google";
}

export async function extractProspectsWithEngine(input: {
  engine: EngineId;
  niche: string;
  city: string;
  limit: number;
  keys: EngineKeys;
  deepCrawl?: boolean;
}): Promise<EngineResult> {
  return extractWithHybrid({
    engine: input.engine,
    niche: input.niche,
    city: input.city,
    limit: input.limit,
    apifyToken: input.keys.apifyToken,
    apifyActor: input.keys.apifyActor,
    googleKey: input.keys.googleKey,
    deepCrawl: input.deepCrawl,
  });
}
