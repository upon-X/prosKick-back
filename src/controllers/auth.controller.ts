import type { Request, Response } from "express";
import {
  auth_service,
  login_request_schema,
  update_profile_request_schema,
} from "../services/auth.service";
import { refresh_queue_service } from "../services/refresh_queue.service";
import { jwt_service } from "../services/jwt.service";
import { e_device_type } from "../models/refresh_token.model";
import { env } from "../config/environment";
import logger from "../config/logger";
import { z } from "zod";

/**
 * Controlador de autenticación
 */
export class AuthController {
  /**
   * Helper para setear cookies de autenticación
   */
  private set_auth_cookies(
    res: Response,
    access_token: string,
    refresh_token: string,
    refresh_expires_in: string
  ): void {
    const is_production = env.NODE_ENV === "production";
    const cookie_domain = is_production ? undefined : undefined; // Configurar dominio en prod si es necesario

    // Access token cookie (httpOnly, corta duración)
    res.cookie("access_token", access_token, {
      httpOnly: true,
      secure: is_production, // HTTPS only en producción
      sameSite: is_production ? "none" : "lax", // 'none' para cross-domain en prod
      maxAge: 15 * 60 * 1000, // 15 minutos en ms
      path: "/",
      domain: cookie_domain,
    });

    // Refresh token cookie (httpOnly, larga duración)
    const refresh_max_age = this.parse_expiry_to_ms(refresh_expires_in);
    res.cookie("refresh_token", refresh_token, {
      httpOnly: true,
      secure: is_production,
      sameSite: is_production ? "none" : "lax",
      maxAge: refresh_max_age,
      path: "/",
      domain: cookie_domain,
    });
  }

  /**
   * Helper para convertir string de expiración a milisegundos
   */
  private parse_expiry_to_ms(expiry: string): number {
    const unit = expiry.slice(-1);
    const value = parseInt(expiry.slice(0, -1), 10);

    const multipliers: Record<string, number> = {
      s: 1000,
      m: 60 * 1000,
      h: 60 * 60 * 1000,
      d: 24 * 60 * 60 * 1000,
    };

    return value * (multipliers[unit] || 1000);
  }

  /**
   * Helper para limpiar cookies de autenticación
   */
  private clear_auth_cookies(res: Response): void {
    const is_production = env.NODE_ENV === "production";
    const cookie_options = {
      httpOnly: true,
      secure: is_production,
      sameSite: (is_production ? "none" : "lax") as "none" | "lax",
      path: "/",
    };

    res.clearCookie("access_token", cookie_options);
    res.clearCookie("refresh_token", cookie_options);
  }

  /**
   * Autentica un usuario con Google y setea cookies JWT
   * POST /auth/login
   */
  async login(req: Request, res: Response): Promise<void> {
    try {
      // Validar datos de entrada
      const validated_data = login_request_schema.parse(req.body);

      // Detectar tipo de dispositivo del header X-Device-Type
      const device_type_header = req.headers["x-device-type"] as string;
      const device_type =
        device_type_header === "mobile"
          ? e_device_type.mobile
          : e_device_type.web;

      // Autenticar con Google y generar tokens
      const auth_result = await auth_service.authenticate_with_google(
        validated_data.id_token,
        device_type
      );

      // Setear cookies con los tokens (solo si es web via proxy)
      // Mobile apps recibirán los tokens en el body
      if (device_type === e_device_type.web) {
        this.set_auth_cookies(
          res,
          auth_result.tokens.access_token,
          auth_result.tokens.refresh_token,
          auth_result.tokens.refresh_expires_in
        );
      }

      logger.info("Login exitoso", {
        user_id: auth_result.user._id,
        device_type,
        is_new_user: auth_result.is_new_user,
      });

      res.status(200).json({
        success: true,
        message: auth_result.is_new_user
          ? "Usuario creado exitosamente"
          : "Login exitoso",
        data: {
          user: {
            id: auth_result.user._id,
            name: auth_result.user.name,
            email: auth_result.user.email,
            avatar_url: auth_result.user.avatar_url,
            roles: auth_result.user.roles,
            is_verified: auth_result.user.is_verified,
            created_at: auth_result.user.created_at,
            last_login_at: auth_result.user.last_login_at,
            subscription: auth_result.user.subscription,
          },
          player_profile: {
            id: auth_result.player_profile._id,
            handle: auth_result.player_profile.handle,
            name: auth_result.player_profile.name,
            avatar_url: auth_result.player_profile.avatar_url,
            location: auth_result.player_profile.location,
            elo: auth_result.player_profile.elo,
            rep_score: auth_result.player_profile.rep_score,
            stats: auth_result.player_profile.stats,
          },
          is_new_user: auth_result.is_new_user,
          // Incluir tokens en el response solo para mobile
          ...(device_type === e_device_type.mobile && {
            tokens: {
              access_token: auth_result.tokens.access_token,
              refresh_token: auth_result.tokens.refresh_token,
              access_expires_in: auth_result.tokens.access_expires_in,
              refresh_expires_in: auth_result.tokens.refresh_expires_in,
            },
          }),
        },
      });
    } catch (error) {
      logger.error("Error en login:", error);

      if (error instanceof z.ZodError) {
        res.status(400).json({
          success: false,
          error: "Datos inválidos",
          message: "Los datos enviados no son válidos",
          details: error.issues,
        });
        return;
      }

      if (error instanceof Error && error.message.includes("Token inválido")) {
        res.status(401).json({
          success: false,
          error: "Token inválido",
          message: "El token de Google no es válido o ha expirado",
        });
        return;
      }

      res.status(500).json({
        success: false,
        error: "Error interno",
        message: "Error procesando la autenticación",
      });
    }
  }

  /**
   * Obtiene el perfil del usuario autenticado
   * GET /auth/me
   */
  async get_me(req: Request, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          error: "No autenticado",
          message: "Debes estar autenticado para acceder a este recurso",
        });
        return;
      }

      const user = await auth_service.get_user_by_id(req.user.id);
      const player_profile = await auth_service.get_player_profile_by_user_id(
        req.user.id
      );

      if (!user || !player_profile) {
        res.status(404).json({
          success: false,
          error: "Usuario no encontrado",
          message: "El usuario o perfil no existe",
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: {
          user: {
            id: user._id,
            name: user.name,
            email: user.email,
            avatar_url: user.avatar_url,
            roles: user.roles,
            is_verified: user.is_verified,
            created_at: user.created_at,
            last_login_at: user.last_login_at,
            subscription: user.subscription,
          },
          player_profile: {
            id: player_profile._id,
            handle: player_profile.handle,
            name: player_profile.name,
            location: player_profile.location,
            foot: player_profile.foot,
            position: player_profile.position,
            height_cm: player_profile.height_cm,
            weight_kg: player_profile.weight_kg,
            avatar_url: player_profile.avatar_url,
            elo: player_profile.elo,
            rep_score: player_profile.rep_score,
            stats: player_profile.stats,
          },
        },
      });
    } catch (error) {
      logger.error("Error obteniendo perfil:", error);
      res.status(500).json({
        success: false,
        error: "Error interno",
        message: "Error obteniendo el perfil del usuario",
      });
    }
  }

  /**
   * Refresca los tokens de autenticación usando refresh token
   * POST /auth/refresh
   */
  async refresh(req: Request, res: Response): Promise<void> {
    try {
      let refresh_token: string | undefined;
      let token_source: "cookie" | "header" | null = null;

      // 1. Intentar obtener refresh token de cookie (web)
      if (req.cookies && req.cookies.refresh_token) {
        refresh_token = req.cookies.refresh_token;
        token_source = "cookie";
      }
      // 2. Fallback a Authorization header (mobile)
      else if (req.headers.authorization) {
        const auth_header = req.headers.authorization;
        refresh_token = auth_header.split(" ")[1];
        token_source = "header";
      }

      if (!refresh_token) {
        res.status(401).json({
          success: false,
          error: "Refresh token requerido",
          message: "No se proporcionó un refresh token",
        });
        return;
      }

      // Procesar refresh usando la cola de BullMQ (deduplicación automática)
      const result = await refresh_queue_service.add_refresh_job(refresh_token);

      if (!result.success) {
        // Si se detectó reuso de token, limpiar cookies
        if (result.should_logout && token_source === "cookie") {
          this.clear_auth_cookies(res);
        }

        res.status(401).json({
          success: false,
          error: "Token refresh failed",
          message: result.error || "No se pudo refrescar el token",
          should_logout: result.should_logout,
        });
        return;
      }

      if (!result.tokens) {
        res.status(500).json({
          success: false,
          error: "Error interno",
          message: "No se pudieron generar nuevos tokens",
        });
        return;
      }

      // Setear nuevas cookies si es web
      if (token_source === "cookie") {
        this.set_auth_cookies(
          res,
          result.tokens.access_token,
          result.tokens.refresh_token,
          result.tokens.refresh_expires_in
        );
      }

      logger.info("Tokens refrescados exitosamente", { source: token_source });

      res.status(200).json({
        success: true,
        message: "Tokens refrescados exitosamente",
        data: {
          // Incluir tokens en response solo para mobile
          ...(token_source === "header" && {
            access_token: result.tokens.access_token,
            refresh_token: result.tokens.refresh_token,
            access_expires_in: result.tokens.access_expires_in,
            refresh_expires_in: result.tokens.refresh_expires_in,
          }),
        },
      });
    } catch (error) {
      logger.error("Error refrescando tokens:", error);
      res.status(500).json({
        success: false,
        error: "Error interno",
        message: "Error refrescando los tokens",
      });
    }
  }

  /**
   * Cierra la sesión del usuario (revoca refresh token)
   * POST /auth/logout
   */
  async logout(req: Request, res: Response): Promise<void> {
    try {
      let refresh_token: string | undefined;
      let token_source: "cookie" | "header" | null = null;

      // Obtener refresh token
      if (req.cookies && req.cookies.refresh_token) {
        refresh_token = req.cookies.refresh_token;
        token_source = "cookie";
      } else if (req.headers.authorization) {
        const auth_header = req.headers.authorization;
        refresh_token = auth_header.split(" ")[1];
        token_source = "header";
      }

      // Revocar el refresh token si existe
      if (refresh_token) {
        await jwt_service.revoke_refresh_token(refresh_token);
        logger.info("Refresh token revocado", { source: token_source });
      }

      // Limpiar cookies si es web
      if (token_source === "cookie") {
        this.clear_auth_cookies(res);
      }

      res.status(200).json({
        success: true,
        message: "Sesión cerrada exitosamente",
      });
    } catch (error) {
      logger.error("Error en logout:", error);

      // Intentar limpiar cookies de todas formas
      this.clear_auth_cookies(res);

      res.status(200).json({
        success: true,
        message: "Sesión cerrada (con errores internos)",
      });
    }
  }

  /**
   * Actualiza el perfil del jugador
   * PATCH /auth/profile
   */
  async update_profile(req: Request, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          error: "No autenticado",
          message: "Debes estar autenticado para acceder a este recurso",
        });
        return;
      }

      // Validar datos de entrada
      const validated_data = update_profile_request_schema.parse(req.body);

      // Verificar disponibilidad de handle si se está cambiando
      if (validated_data.handle) {
        const is_available = await auth_service.is_handle_available(
          validated_data.handle,
          req.user.id
        );

        if (!is_available) {
          res.status(400).json({
            success: false,
            error: "Handle no disponible",
            message: "El handle seleccionado ya está en uso",
          });
          return;
        }
      }

      // Actualizar perfil
      const updated_profile = await auth_service.update_player_profile(
        req.user.id,
        validated_data
      );

      logger.info("Perfil actualizado", {
        user_id: req.user.id,
        profile_id: updated_profile._id,
      });

      res.status(200).json({
        success: true,
        message: "Perfil actualizado exitosamente",
        data: {
          player_profile: {
            id: updated_profile._id,
            handle: updated_profile.handle,
            name: updated_profile.name,
            location: updated_profile.location,
            foot: updated_profile.foot,
            position: updated_profile.position,
            height_cm: updated_profile.height_cm,
            weight_kg: updated_profile.weight_kg,
            avatar_url: updated_profile.avatar_url,
            elo: updated_profile.elo,
            rep_score: updated_profile.rep_score,
            stats: updated_profile.stats,
          },
        },
      });
    } catch (error) {
      logger.error("Error actualizando perfil:", error);

      if (error instanceof z.ZodError) {
        res.status(400).json({
          success: false,
          error: "Datos inválidos",
          message: "Los datos enviados no son válidos",
          details: error.issues,
        });
        return;
      }

      res.status(500).json({
        success: false,
        error: "Error interno",
        message: "Error actualizando el perfil",
      });
    }
  }

  /**
   * Verifica disponibilidad de handle
   * GET /auth/check-handle/:handle
   */
  async check_handle(req: Request, res: Response): Promise<void> {
    try {
      const { handle } = req.params;
      const exclude_user_id = req.user?.id;

      if (!handle || handle.length < 3 || handle.length > 20) {
        res.status(400).json({
          success: false,
          error: "Handle inválido",
          message: "El handle debe tener entre 3 y 20 caracteres",
        });
        return;
      }

      const is_available = await auth_service.is_handle_available(
        handle,
        exclude_user_id
      );

      res.status(200).json({
        success: true,
        data: {
          handle,
          available: is_available,
        },
      });
    } catch (error) {
      logger.error("Error verificando handle:", error);
      res.status(500).json({
        success: false,
        error: "Error interno",
        message: "Error verificando disponibilidad del handle",
      });
    }
  }
}

export const auth_controller = new AuthController();
