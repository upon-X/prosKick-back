import mongoose, { Schema, Document } from "mongoose";
import { z } from "zod";
import { collections } from "./config";

// Esquema Zod para validación
export const user_schema_zod = z.object({
  name: z.string().min(1).max(100).optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  providers: z
    .array(
      z.object({
        type: z.enum(["google", "apple"]),
        sub: z.string(),
      })
    )
    .min(1, "Debe tener al menos un proveedor"),
  avatar_url: z.string().optional(),
  is_verified: z.boolean().default(false),
  created_at: z.date().default(() => new Date()),
  last_login_at: z.date().optional(),
  roles: z
    .array(z.enum(["player", "organizer", "referee", "admin"]))
    .default(["player"]),
  timezone: z.string().default("America/Argentina/Buenos_Aires"),
  subscription: z
    .object({
      plan: z.enum(["free", "pro", "organizer_pro"]).default("free"),
      started_at: z.date().optional(),
      expires_at: z.date().optional(),
      seats_teams: z.number().default(1),
      venues_limit: z.union([z.number(), z.literal("unlimited")]).default(10),
      stripe_subscription_id: z.string().optional(),
      status: z
        .enum(["active", "trial", "past_due", "canceled"])
        .default("active"),
    })
    .optional(),
});

export type UserType = z.infer<typeof user_schema_zod>;

// Interfaz para el documento de MongoDB
export interface IUser extends Document, UserType {
  _id: string;
}

// Esquema de MongoDB
const user_schema = new Schema<IUser>(
  {
    name: {
      type: String,
      trim: true,
      maxlength: 100,
    },
    email: {
      type: String,
      sparse: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    phone: {
      type: String,
      sparse: true,
      unique: true,
      trim: true,
    },
    providers: [
      {
        type: {
          type: String,
          enum: ["google", "apple"],
          required: true,
        },
        sub: {
          type: String,
          required: true,
        },
      },
    ],
    avatar_url: {
      type: String,
      trim: true,
    },
    is_verified: {
      type: Boolean,
      default: false,
    },
    created_at: {
      type: Date,
      default: Date.now,
    },
    last_login_at: {
      type: Date,
    },
    roles: [
      {
        type: String,
        enum: ["player", "organizer", "referee", "admin"],
        default: "player",
      },
    ],
    timezone: {
      type: String,
      default: "America/Argentina/Buenos_Aires",
    },
    subscription: {
      plan: {
        type: String,
        enum: ["free", "pro", "organizer_pro"],
        default: "free",
      },
      started_at: Date,
      expires_at: Date,
      seats_teams: {
        type: Number,
        default: 1,
      },
      venues_limit: {
        type: Schema.Types.Mixed,
        default: 10,
      },
      stripe_subscription_id: String,
      status: {
        type: String,
        enum: ["active", "trial", "past_due", "canceled"],
        default: "active",
      },
    },
  },
  {
    timestamps: true,
    collection: collections.users,
  }
);

// Índices
user_schema.index({ email: 1 }, { unique: true, sparse: true });
user_schema.index({ phone: 1 }, { unique: true, sparse: true });
user_schema.index({ "providers.sub": 1 });
user_schema.index(
  { "providers.type": 1, "providers.sub": 1 },
  { unique: true }
);

export const User = mongoose.model<IUser>("User", user_schema);
