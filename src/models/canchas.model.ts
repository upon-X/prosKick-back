import mongoose, { Schema, Document } from "mongoose";
import { z } from "zod";
import { collections } from "./config";

// Esquema Zod para validación
export const canchas_schema_zod = z.object({
  name: z.string().min(1).max(100),
  lat: z.number(),
  lng: z.number(),
  phone: z.string().optional(),
  image: z.string().optional(),
  description: z.string().max(1000).optional(),
  address: z.string().optional(),
  tipo: z.enum(["organizador", "equipo_primera"]),
  reputacion: z.number(),
  organizador: z.string().optional(),
  equipo: z.string().optional(),
});

export type CanchaType = z.infer<typeof canchas_schema_zod>;

// Interfaz para el documento de MongoDB
export interface ICancha extends Document, CanchaType {
  _id: string;
}

// Esquema de MongoDB
const canchas_schema = new Schema<ICancha>(
  {
    name: {
      type: String,
      trim: true,
      maxlength: 100,
    },
    lat: {
      type: Number,
      required: true,
    },
    lng: {
      type: Number,
      required: true,
    },
    phone: {
      type: String,
    },
    image: {
      type: String,
    },
    description: {
      type: String,
      maxlength: 1000,
    },
    address: {
      type: String,
    },
    tipo: {
      type: String,
      enum: ["organizador", "equipo_primera"],
      required: true,
    },
    reputacion: {
      type: Number,
      required: true,
    },
    organizador: {
      type: String,
    },
    equipo: {
      type: String,
    },
  },
  {
    timestamps: true,
    collection: collections.canchas,
  }
);

// Índices
canchas_schema.index({ lat: 1, lng: 1 }, { unique: true, sparse: true });

export const Cancha = mongoose.model<ICancha>("Cancha", canchas_schema);
