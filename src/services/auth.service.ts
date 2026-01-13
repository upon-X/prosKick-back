import { User, type IUser } from "../models/user.model";
import {
  PlayerProfile,
  type IPlayerProfile,
} from "../models/player_profile.model";
import { firebase_service } from "./firebase.service";
import { jwt_service, type ITokenPair } from "./jwt.service";
import { e_device_type } from "../models/refresh_token.model";
import { user_schema_zod } from "../models/user.model";
import { player_profile_schema_zod } from "../models/player_profile.model";
import logger from "../config/logger";
import { z } from "zod";

// DTOs para validación
export const login_request_schema = z.object({
  id_token: z.string().min(1, "ID Token es requerido"),
});

export const update_profile_request_schema = z.object({
  name: z.string().min(2).max(50).optional(),
  handle: z.string().min(3).max(20).optional(),
  location: z
    .object({
      province: z.string().min(1),
      city: z.string().min(1),
    })
    .optional(),
  foot: z.enum(["right", "left", "both"]).optional(),
  position: z.array(z.enum(["GK", "DEF", "MID", "FWD"])).optional(),
  height_cm: z.number().min(100).max(250).optional(),
  weight_kg: z.number().min(30).max(200).optional(),
});

export type LoginRequest = z.infer<typeof login_request_schema>;
export type UpdateProfileRequest = z.infer<
  typeof update_profile_request_schema
>;

export interface AuthResult {
  user: IUser;
  player_profile: IPlayerProfile;
  tokens: ITokenPair;
  is_new_user: boolean;
}

/**
 * Servicio de autenticación con Google
 */
class AuthService {
  /**
   * Autentica un usuario con Google y genera tokens JWT
   * @param id_token - Token ID de Firebase
   * @param device_type - Tipo de dispositivo (web o mobile)
   * @returns Información del usuario autenticado con tokens JWT
   */
  async authenticate_with_google(
    id_token: string,
    device_type: e_device_type = e_device_type.web
  ): Promise<AuthResult> {
    try {
      // Verificar token con Firebase
      const decoded_token = await firebase_service.verify_id_token(id_token);

      if (!decoded_token.email) {
        throw new Error("Email no disponible en el token");
      }

      // Buscar usuario existente por providers
      let user = await User.findOne({
        "providers.sub": decoded_token.uid,
        "providers.type": "google",
      });

      let is_new_user = false;

      if (!user) {
        // Crear nuevo usuario
        user = await this.create_user_from_google(decoded_token);
        is_new_user = true;
        logger.info("Nuevo usuario creado", {
          user_id: user?._id,
          email: decoded_token.email,
        });
      } else {
        // Actualizar último login y nombre si viene de Google
        user.last_login_at = new Date();

        // Actualizar nombre si viene de Google y no está definido o es diferente
        if (
          decoded_token.name &&
          (!user.name || user.name !== decoded_token.name)
        ) {
          user.name = decoded_token.name;
          logger.info("Nombre de usuario actualizado desde Google", {
            user_id: user._id,
            old_name: user.name,
            new_name: decoded_token.name,
          });
        }

        await user.save();
        logger.info("Usuario existente autenticado", {
          user_id: user._id,
          email: decoded_token.email,
        });
      }

      if (!user) {
        throw new Error("Error creando usuario");
      }

      // Buscar o crear perfil de jugador
      let player_profile = await PlayerProfile.findOne({
        user_id: user._id.toString(),
      });

      if (!player_profile) {
        player_profile = await this.create_player_profile(user, decoded_token);
        logger.info("Perfil de jugador creado", {
          profile_id: player_profile?._id,
        });
      }

      if (!player_profile) {
        throw new Error("Error creando perfil de jugador");
      }

      // Generar par de tokens JWT
      const tokens = await jwt_service.generate_token_pair(
        user._id.toString(),
        device_type
      );

      logger.info("Tokens JWT generados", {
        user_id: user._id,
        device_type,
        is_new_user,
      });

      return {
        user: user as IUser,
        player_profile: player_profile as IPlayerProfile,
        tokens,
        is_new_user,
      };
    } catch (error) {
      logger.error("Error en autenticación con Google:", error);
      throw error;
    }
  }

  /**
   * Crea un nuevo usuario desde datos de Google
   */
  private async create_user_from_google(decoded_token: any): Promise<any> {
    const user_data = {
      name: decoded_token.name || "Usuario", // Nombre de Google
      email: decoded_token.email,
      providers: [
        {
          type: "google" as const,
          sub: decoded_token.uid,
        },
      ],
      avatar_url: decoded_token.picture, // Foto de perfil de Google
      is_verified: true, // Google ya verifica el email
      roles: ["player"] as const,
      subscription: {
        plan: "free" as const,
        seats_teams: 1,
        venues_limit: 10,
        status: "active" as const,
      },
    };

    // Validar con Zod
    const validated_data = user_schema_zod.parse(user_data);

    const user = new User(validated_data);
    await user.save();

    return user;
  }

  /**
   * Crea un perfil de jugador para un usuario
   */
  private async create_player_profile(
    user: any,
    decoded_token: any
  ): Promise<any> {
    const profile_data = {
      user_id: user._id.toString(),
      handle: this.generate_handle(decoded_token.name || decoded_token.email),
      name: decoded_token.name || "Usuario",
      avatar_url: decoded_token.picture, // Foto de perfil de Google
      location: {
        country: "AR" as const,
        province: "Buenos Aires", // Default, el usuario debe actualizarlo
        city: "Buenos Aires",
      },
      elo: 1000,
      reliability: 0.6,
      rep_score: 50,
      stats: {
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
      },
    };

    // Validar con Zod
    const validated_data = player_profile_schema_zod.parse(profile_data);

    const player_profile = new PlayerProfile(validated_data);
    await player_profile.save();

    return player_profile;
  }

  /**
   * Genera un handle único basado en el nombre o email
   */
  private generate_handle(name_or_email: string): string {
    const base = name_or_email
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "")
      .substring(0, 15);

    const random_suffix = Math.random().toString(36).substring(2, 6);
    return `${base}${random_suffix}`;
  }

  /**
   * Actualiza el perfil de un jugador
   */
  async update_player_profile(
    user_id: string,
    update_data: UpdateProfileRequest
  ): Promise<IPlayerProfile> {
    try {
      const player_profile = await PlayerProfile.findOne({ user_id });

      if (!player_profile) {
        throw new Error("Perfil de jugador no encontrado");
      }

      // Validar datos de actualización
      const validated_data = update_profile_request_schema.parse(update_data);

      // Actualizar campos
      Object.assign(player_profile, validated_data);
      player_profile.updated_at = new Date();

      await player_profile.save();

      logger.info("Perfil actualizado", {
        user_id,
        profile_id: player_profile._id,
      });
      return player_profile;
    } catch (error) {
      logger.error("Error actualizando perfil:", error);
      throw error;
    }
  }

  /**
   * Obtiene un usuario por ID
   */
  async get_user_by_id(user_id: string): Promise<IUser | null> {
    try {
      return await User.findById(user_id);
    } catch (error) {
      logger.error("Error obteniendo usuario:", error);
      throw error;
    }
  }

  /**
   * Obtiene el perfil de jugador por ID de usuario
   */
  async get_player_profile_by_user_id(
    user_id: string
  ): Promise<IPlayerProfile | null> {
    try {
      return await PlayerProfile.findOne({ user_id });
    } catch (error) {
      logger.error("Error obteniendo perfil de jugador:", error);
      throw error;
    }
  }

  /**
   * Verifica si un handle está disponible
   */
  async is_handle_available(
    handle: string,
    exclude_user_id?: string
  ): Promise<boolean> {
    try {
      const query: any = { handle };
      if (exclude_user_id) {
        query.user_id = { $ne: exclude_user_id };
      }

      const existing = await PlayerProfile.findOne(query);
      return !existing;
    } catch (error) {
      logger.error("Error verificando disponibilidad de handle:", error);
      throw error;
    }
  }
}

export const auth_service = new AuthService();
