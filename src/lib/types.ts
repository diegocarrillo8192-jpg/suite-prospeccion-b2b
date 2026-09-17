import type { DetectedTech, WebOpportunity } from "./tech-detector";

export type SocialPlatform =
  | "instagram"
  | "linkedin"
  | "facebook"
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
  emails?: string[];
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

export type TabId = "search" | "sender";

export interface SendStatus {
  total: number;
  sent: number;
  failed: number;
  pending: number;
  current: number;
}
