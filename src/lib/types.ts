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
}

export type TabId = "search" | "sender";

export interface SendStatus {
  total: number;
  sent: number;
  failed: number;
  pending: number;
  current: number;
}
