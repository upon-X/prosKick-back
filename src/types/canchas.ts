export type TipoCancha = "organizador" | "equipo_primera";

export interface ICancha {
  id: string;
  name: string;
  lat: number;
  lng: number;
  phone?: number;
  image?: string;
  description?: string;
  address?: string;
  tipo: TipoCancha;
  reputacion: number; // 0-100
  organizador?: string; // Solo para tipo 'organizador'
  equipo?: string; // Solo para tipo 'equipo_primera'
}
