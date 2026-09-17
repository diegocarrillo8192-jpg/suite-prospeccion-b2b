import type { Prospect } from "../types";
import type { ExtractionMeta } from "../extract";

export type EngineId = "free" | "apify" | "google";

export interface EngineRequest {
  niche: string;
  city: string;
  limit: number;
  apifyToken: string;
  apifyActor: string;
  googleKey: string;
}

export interface EngineResult {
  prospects: Prospect[];
  meta: ExtractionMeta;
}

export type EngineRunner = (request: EngineRequest) => Promise<EngineResult>;

export class ExtractionError extends Error {
  readonly code: string;

  constructor(code: string, message?: string) {
    super(message ?? code);
    this.name = "ExtractionError";
    this.code = code;
  }
}
