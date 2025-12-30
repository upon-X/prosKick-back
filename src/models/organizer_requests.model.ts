import mongoose, { Schema, Document } from "mongoose";
import { z } from "zod";
import { collections } from "./config";
import { ORGANIZER_REQUEST_STATUS } from "../types/organizers";

// Esquema Zod para validación
export const organizer_request_schema_zod = z.object({
  name: z.string().min(2).max(100),
  email: z.string().email(),
  phone_number: z.string().min(10).max(20),
  location: z.object({
    country: z.literal("AR"),
    province: z.string().min(2).max(50),
    city: z.string().min(2).max(50),
    address: z.string().min(5).max(200),
    coordinates: z
      .object({
        lat: z.number().min(-90).max(90),
        lng: z.number().min(-180).max(180),
      })
      .optional(), // Opcional en input, se calcula en backend
  }),
  image: z.string().refine(
    (val) => {
      // Aceptar URLs o Data URIs de imagen
      const isUrl = /^https?:\/\/.+/.test(val);
      const isDataUri = /^data:image\/(jpeg|jpg|png|webp);base64,/.test(val);
      return isUrl || isDataUri;
    },
    { message: "La imagen debe ser una URL válida o un Data URI de imagen" }
  ),
  user_id: z
    .string()
    .min(1, "El user_id es obligatorio para crear solicitudes"), // Obligatorio
  reviewed_by: z
    .object({
      id: z.string(),
      name: z.string(),
    })
    .optional(), // ID del admin que revisó
  reviewed_at: z.date().optional(),
  status: z
    .enum(ORGANIZER_REQUEST_STATUS)
    .default(ORGANIZER_REQUEST_STATUS.PENDING_REVIEW),
  rejection_reason: z.string().max(500).optional(), // Motivo del rechazo
  notes: z.string().max(1000).optional(), // Notas internas del admin
  created_at: z.date().default(() => new Date()),
  updated_at: z.date().default(() => new Date()),
});

export type OrganizerRequestType = z.infer<typeof organizer_request_schema_zod>;

// Interfaz para el documento de MongoDB
export interface IOrganizerRequest extends Document, OrganizerRequestType {
  location: {
    country: "AR";
    province: string;
    city: string;
    address: string;
    coordinates: {
      lat: number;
      lng: number;
    };
  };
  image: string;
  user_id: string;
}

// Esquema de MongoDB
const organizer_request_schema = new Schema<IOrganizerRequest>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 100,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    phone_number: {
      type: String,
      required: true,
      trim: true,
      minlength: 10,
      maxlength: 20,
    },
    location: {
      country: {
        type: String,
        default: "AR",
      },
      province: {
        type: String,
        required: true,
        trim: true,
        minlength: 2,
        maxlength: 50,
      },
      city: {
        type: String,
        required: true,
        trim: true,
        minlength: 2,
        maxlength: 50,
      },
      address: {
        type: String,
        required: true,
        trim: true,
        minlength: 5,
        maxlength: 200,
      },
      coordinates: {
        lat: {
          type: Number,
          required: false,
          min: -90,
          max: 90,
        },
        lng: {
          type: Number,
          required: false,
          min: -180,
          max: 180,
        },
      },
    },
    image: {
      type: String,
      required: true,
      trim: true,
    },
    user_id: {
      type: String,
      required: true,
      ref: "User",
    },
    reviewed_by: {
      id: {
        type: String,
        ref: "User",
        sparse: true,
      },
      name: {
        type: String,
        ref: "User",
        sparse: true,
      },
    },
    reviewed_at: {
      type: Date,
    },
    status: {
      type: String,
      enum: Object.values(ORGANIZER_REQUEST_STATUS),
      default: ORGANIZER_REQUEST_STATUS.PENDING_REVIEW,
    },
    rejection_reason: {
      type: String,
      trim: true,
      maxlength: 500,
    },
    notes: {
      type: String,
      trim: true,
      maxlength: 1000,
    },
  },
  {
    timestamps: true,
    collection: collections.organizer_requests || "organizer_requests", // Fallback si no está en config
  }
);

// Índices para optimizar consultas
organizer_request_schema.index({ email: 1 }, { unique: true });
organizer_request_schema.index({ phone_number: 1 }, { sparse: true });
organizer_request_schema.index({ status: 1 });
organizer_request_schema.index({ "location.province": 1, "location.city": 1 });
organizer_request_schema.index(
  {
    "location.coordinates.lat": 1,
    "location.coordinates.lng": 1,
  },
  { sparse: true }
);
organizer_request_schema.index({ user_id: 1 }, { sparse: true });
organizer_request_schema.index({ reviewed_by: 1 }, { sparse: true });
organizer_request_schema.index({ created_at: -1 });
organizer_request_schema.index({ status: 1, created_at: -1 }); // Para consultas de admin

export const OrganizerRequest = mongoose.model<IOrganizerRequest>(
  "OrganizerRequest",
  organizer_request_schema
);
