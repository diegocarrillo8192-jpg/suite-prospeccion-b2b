import type { DetectedTech, WebOpportunity } from "./tech-detector";

export type SocialPlatform =
  | "instagram"
  | "linkedin"
  | "facebook"
  | "twitter"
  | "whatsapp"
  | "youtube"
  | "tiktok";

export type SocialLinks = Partial<Record<SocialPlatform, string>>;

export type EmailValidationStatus = "valid" | "risky" | "invalid" | "unknown";

export interface EmailValidation {
  email: string;
  domain: string;
  status: EmailValidationStatus;
  label: string;
  reason: string;
  hasMx: boolean;
  disposable: boolean;
  catchAll: boolean;
  mxRecords: string[];
}

export interface Prospect {
  id: string;
  nombre: string;
  empresa: string;
  correo: string;
  telefono: string;
  whatsapp: string;
  direccion: string;
  website: string;
  ciudad: string;
  rubro: string;
  rating?: number;
  reviews?: number;
  emails?: string[];
  /** Correo probable (info@dominio con MX activo) cuando el sitio no publica uno. */
  emailGuess?: string;
  social?: SocialLinks;
  emailStatus?: EmailValidationStatus;
  emailStatusLabel?: string;
  emailReason?: string;
  enriched?: boolean;
  techStack?: DetectedTech[];
  techSsl?: boolean;
  techServer?: string | null;
  webOpportunity?: WebOpportunity;
}

export type TabId = "dashboard" | "search" | "sender" | "connectors" | "guide";

export interface CampaignResult {
  email: string;
  empresa: string;
  ok: boolean;
  message?: string;
}

export interface CampaignRecord {
  id: string;
  createdAt: number;
  subject: string;
  mode: string;
  total: number;
  sent: number;
  failed: number;
  cancelled: boolean;
  results: CampaignResult[];
}

export interface SearchRecord {
  niche: string;
  city: string;
  count: number;
  at: number;
}

export interface SendStatus {
  total: number;
  sent: number;
  failed: number;
  pending: number;
  current: number;
}
