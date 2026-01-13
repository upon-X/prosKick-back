import mongoose, { Schema, Document } from "mongoose";
import { z } from "zod";
import { collections } from "./config";

// Tipos de dispositivos
export enum e_device_type {
  web = "web",
  mobile = "mobile",
}

// Esquema Zod para validación
export const refresh_token_schema_zod = z.object({
  user_id: z.string(),
  token_hash: z.string(),
  family_id: z.string(), // UUID para detectar reuso de tokens
  device_type: z.nativeEnum(e_device_type),
  expires_at: z.date(),
  created_at: z.date().default(() => new Date()),
  is_revoked: z.boolean().default(false),
});

export type RefreshTokenType = z.infer<typeof refresh_token_schema_zod>;

// Interfaz para el documento de MongoDB
export interface IRefreshToken extends Document, RefreshTokenType {
  _id: string;
}

// Esquema de MongoDB
const refresh_token_schema = new Schema<IRefreshToken>(
  {
    user_id: {
      type: String,
      required: true,
      ref: collections.users,
      index: true,
    },
    token_hash: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    family_id: {
      type: String,
      required: true,
      index: true,
    },
    device_type: {
      type: String,
      enum: Object.values(e_device_type),
      required: true,
    },
    expires_at: {
      type: Date,
      required: true,
      index: true, // TTL index configurado abajo
    },
    created_at: {
      type: Date,
      default: Date.now,
    },
    is_revoked: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  {
    timestamps: false,
    collection: "refresh_tokens",
  }
);

// TTL Index: elimina documentos automáticamente después de expires_at
refresh_token_schema.index({ expires_at: 1 }, { expireAfterSeconds: 0 });

// Compound index para búsquedas eficientes
refresh_token_schema.index({ user_id: 1, device_type: 1 });
refresh_token_schema.index({ family_id: 1, is_revoked: 1 });

// Método estático para revocar toda una familia de tokens
refresh_token_schema.statics.revoke_family = async function (
  family_id: string
): Promise<void> {
  await this.updateMany({ family_id }, { is_revoked: true });
};

// Método estático para revocar todos los tokens de un usuario
refresh_token_schema.statics.revoke_user_tokens = async function (
  user_id: string
): Promise<void> {
  await this.updateMany({ user_id }, { is_revoked: true });
};

// Método estático para limpiar tokens expirados y revocados (opcional, TTL ya lo hace)
refresh_token_schema.statics.cleanup_expired =
  async function (): Promise<number> {
    const result = await this.deleteMany({
      $or: [
        { expires_at: { $lt: new Date() } },
        {
          is_revoked: true,
          created_at: { $lt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
        }, // revocados hace más de 30 días
      ],
    });
    return result.deletedCount;
  };

// Modelo
export const RefreshToken = mongoose.model<IRefreshToken>(
  "RefreshToken",
  refresh_token_schema
);

// Actualizar configuración de colecciones
export const refresh_token_collection = "refresh_tokens";
