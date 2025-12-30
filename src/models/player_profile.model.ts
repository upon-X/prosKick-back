import mongoose, { Schema, Document } from "mongoose";
import { z } from "zod";
import { collections } from "./config";

// Esquema Zod para validación
export const player_profile_schema_zod = z.object({
  user_id: z.string(),
  handle: z.string().min(3).max(20),
  name: z.string().min(2).max(50),
  birth: z.string().optional(),
  location: z.object({
    country: z.literal("AR"),
    province: z.string(),
    city: z.string(),
  }),
  foot: z.enum(["right", "left", "both"]).optional(),
  position: z.array(z.enum(["GK", "DEF", "MID", "FWD"])).optional(),
  height_cm: z.number().min(100).max(250).optional(),
  weight_kg: z.number().min(30).max(200).optional(),
  avatar_url: z.string().url().optional(),
  elo: z.number().default(1000),
  reliability: z.number().min(0).max(1).default(0.6),
  rep_score: z.number().min(0).max(100).default(50),
  stats: z
    .object({
      games: z
        .object({
          total: z.number().default(0),
          wins: z.number().default(0),
          loses: z.number().default(0),
          draws: z.number().default(0),
        })
        .default({
          total: 0,
          wins: 0,
          loses: 0,
          draws: 0,
        }),
      goals: z.number().default(0),
      assists: z.number().default(0),
      mvps: z.number().default(0),
      cards_y: z.number().default(0),
      cards_r: z.number().default(0),
    })
    .default({
      games: {
        total: 0,
        wins: 0,
        loses: 0,
        draws: 0,
      },
      goals: 0,
      assists: 0,
      mvps: 0,
      cards_y: 0,
      cards_r: 0,
    }),
  created_at: z.date().default(() => new Date()),
  updated_at: z.date().default(() => new Date()),
});

export type PlayerProfileType = z.infer<typeof player_profile_schema_zod>;

// Interfaz para el documento de MongoDB
export interface IPlayerProfile extends Document, PlayerProfileType {
  _id: string;
}

// Esquema de MongoDB
const player_profile_schema = new Schema<IPlayerProfile>(
  {
    user_id: {
      type: String,
      required: true,
      ref: "User",
    },
    handle: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      minlength: 3,
      maxlength: 20,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 50,
    },
    birth: {
      type: String,
    },
    location: {
      country: {
        type: String,
        default: "AR",
      },
      province: {
        type: String,
        required: true,
      },
      city: {
        type: String,
        required: true,
      },
    },
    foot: {
      type: String,
      enum: ["right", "left", "both"],
    },
    position: [
      {
        type: String,
        enum: ["GK", "DEF", "MID", "FWD"],
      },
    ],
    height_cm: {
      type: Number,
      min: 100,
      max: 250,
    },
    weight_kg: {
      type: Number,
      min: 30,
      max: 200,
    },
    avatar_url: {
      type: String,
    },
    elo: {
      type: Number,
      default: 1000,
    },
    reliability: {
      type: Number,
      min: 0,
      max: 1,
      default: 0.6,
    },
    rep_score: {
      type: Number,
      min: 0,
      max: 100,
      default: 50,
    },
    stats: {
      games: {
        total: {
          type: Number,
          default: 0,
        },
        wins: {
          type: Number,
          default: 0,
        },
        loses: {
          type: Number,
          default: 0,
        },
        draws: {
          type: Number,
          default: 0,
        },
      },
      goals: {
        type: Number,
        default: 0,
      },
      assists: {
        type: Number,
        default: 0,
      },
      mvps: {
        type: Number,
        default: 0,
      },
      cards_y: {
        type: Number,
        default: 0,
      },
      cards_r: {
        type: Number,
        default: 0,
      },
    },
  },
  {
    timestamps: true,
    collection: collections.player_profiles,
  }
);

// Índices
player_profile_schema.index({ handle: 1 }, { unique: true });
player_profile_schema.index({ user_id: 1 }, { unique: true });
player_profile_schema.index({ "location.province": 1, "location.city": 1 });
player_profile_schema.index({ elo: -1 });
player_profile_schema.index({ "location.province": 1, elo: -1 });
player_profile_schema.index({ "location.city": 1, elo: -1 });

export const PlayerProfile = mongoose.model<IPlayerProfile>(
  "PlayerProfile",
  player_profile_schema
);
