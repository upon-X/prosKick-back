import { config } from "dotenv";
import { z } from "zod";

// Cargar variables de entorno
config();

export enum e_node_env {
  development = "development",
  production = "production",
}

// Esquema de validación para variables de entorno
const envSchema = z.object({
  // Servidor
  NODE_ENV: z
    .enum([e_node_env.development, e_node_env.production])
    .default(e_node_env.development),
  PORT: z.string().transform(Number).default(4040),
  APP_NAME: z.string().default("futbol_app"),
  VERSION: z.string().default("1.0.0"),
  FRONTEND_URL: z.string().default("http://localhost:3000"),
  LOG_FILE: z.string().default("logs/app.log"),

  // Mongo
  MONGO_DB_URI: z.string().default("mongodb://localhost:27017/futbol_app"),
  MONGO_DB_NAME: z.string().default("futbol_app"),

  // JWT - OBLIGATORIO en producción
  JWT_SECRET: z
    .string()
    .min(32, "JWT_SECRET debe tener al menos 32 caracteres")
    .refine(
      (val) => {
        // En producción, JWT_SECRET debe estar definido y no ser el default
        if (process.env.NODE_ENV === "production") {
          return (
            val !==
            "mi-clave-secreta-super-segura-de-al-menos-32-caracteres-para-desarrollo"
          );
        }
        return true;
      },
      {
        message:
          "JWT_SECRET debe ser configurado específicamente para producción",
      }
    )
    .default(
      "mi-clave-secreta-super-segura-de-al-menos-32-caracteres-para-desarrollo"
    ),
  JWT_REFRESH_SECRET: z
    .string()
    .min(32, "JWT_REFRESH_SECRET debe tener al menos 32 caracteres")
    .refine(
      (val) => {
        if (process.env.NODE_ENV === "production") {
          return (
            val !==
            "mi-refresh-secret-super-segura-de-al-menos-32-caracteres-para-desarrollo"
          );
        }
        return true;
      },
      {
        message:
          "JWT_REFRESH_SECRET debe ser configurado específicamente para producción",
      }
    )
    .default(
      "mi-refresh-secret-super-segura-de-al-menos-32-caracteres-para-desarrollo"
    ),
  JWT_ACCESS_EXPIRY: z.string().default("15m"),
  JWT_REFRESH_EXPIRY_WEB: z.string().default("7d"),
  JWT_REFRESH_EXPIRY_MOBILE: z.string().default("90d"),

  // Redis
  REDIS_URL: z.string().default("redis://localhost:6379"),

  // Firebase Admin SDK
  FIREBASE_PROJECT_ID: z.string().min(1, "FIREBASE_PROJECT_ID es requerido"),
  FIREBASE_PRIVATE_KEY_ID: z
    .string()
    .min(1, "FIREBASE_PRIVATE_KEY_ID es requerido"),
  FIREBASE_PRIVATE_KEY: z.string().min(1, "FIREBASE_PRIVATE_KEY es requerido"),
  FIREBASE_CLIENT_EMAIL: z
    .string()
    .email("FIREBASE_CLIENT_EMAIL debe ser un email válido"),
  FIREBASE_CLIENT_ID: z.string().min(1, "FIREBASE_CLIENT_ID es requerido"),
});

// Validar y exportar variables de entorno
export const env = envSchema.parse(process.env);

// Tipos derivados
export type Environment = z.infer<typeof envSchema>;
