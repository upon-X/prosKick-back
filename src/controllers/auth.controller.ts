import type { Request, Response } from 'express';
import { auth_service, login_request_schema, update_profile_request_schema } from '../services/auth.service';
import logger from '../config/logger';
import { z } from 'zod';

/**
 * Controlador de autenticación
 */
export class AuthController {
  /**
   * Autentica un usuario con Google
   * POST /auth/login
   */
  async login(req: Request, res: Response): Promise<void> {
    try {
      // Validar datos de entrada
      const validated_data = login_request_schema.parse(req.body);

      // Autenticar con Google
      const auth_result = await auth_service.authenticate_with_google(validated_data.id_token);

      logger.info('Login exitoso', {
        user_id: auth_result.user._id,
        is_new_user: auth_result.is_new_user
      });

      res.status(200).json({
        success: true,
        message: auth_result.is_new_user ? 'Usuario creado exitosamente' : 'Login exitoso',
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
            subscription: auth_result.user.subscription
          },
          player_profile: {
            id: auth_result.player_profile._id,
            handle: auth_result.player_profile.handle,
            name: auth_result.player_profile.name,
            avatar_url: auth_result.player_profile.avatar_url,
            location: auth_result.player_profile.location,
            elo: auth_result.player_profile.elo,
            rep_score: auth_result.player_profile.rep_score,
            stats: auth_result.player_profile.stats
          },
          is_new_user: auth_result.is_new_user
        }
      });
    } catch (error) {
      logger.error('Error en login:', error);
      
      if (error instanceof z.ZodError) {
        res.status(400).json({
          success: false,
          error: 'Datos inválidos',
          message: 'Los datos enviados no son válidos',
          details: error.issues
        });
        return;
      }

      if (error instanceof Error && error.message.includes('Token inválido')) {
        res.status(401).json({
          success: false,
          error: 'Token inválido',
          message: 'El token de Google no es válido o ha expirado'
        });
        return;
      }

      res.status(500).json({
        success: false,
        error: 'Error interno',
        message: 'Error procesando la autenticación'
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
          error: 'No autenticado',
          message: 'Debes estar autenticado para acceder a este recurso'
        });
        return;
      }

      const user = await auth_service.get_user_by_id(req.user.id);
      const player_profile = await auth_service.get_player_profile_by_user_id(req.user.id);

      if (!user || !player_profile) {
        res.status(404).json({
          success: false,
          error: 'Usuario no encontrado',
          message: 'El usuario o perfil no existe'
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
            subscription: user.subscription
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
            stats: player_profile.stats
          }
        }
      });
    } catch (error) {
      logger.error('Error obteniendo perfil:', error);
      res.status(500).json({
        success: false,
        error: 'Error interno',
        message: 'Error obteniendo el perfil del usuario'
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
          error: 'No autenticado',
          message: 'Debes estar autenticado para acceder a este recurso'
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
            error: 'Handle no disponible',
            message: 'El handle seleccionado ya está en uso'
          });
          return;
        }
      }

      // Actualizar perfil
      const updated_profile = await auth_service.update_player_profile(
        req.user.id, 
        validated_data
      );

      logger.info('Perfil actualizado', {
        user_id: req.user.id,
        profile_id: updated_profile._id
      });

      res.status(200).json({
        success: true,
        message: 'Perfil actualizado exitosamente',
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
            stats: updated_profile.stats
          }
        }
      });
    } catch (error) {
      logger.error('Error actualizando perfil:', error);
      
      if (error instanceof z.ZodError) {
        res.status(400).json({
          success: false,
          error: 'Datos inválidos',
          message: 'Los datos enviados no son válidos',
          details: error.issues
        });
        return;
      }

      res.status(500).json({
        success: false,
        error: 'Error interno',
        message: 'Error actualizando el perfil'
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
          error: 'Handle inválido',
          message: 'El handle debe tener entre 3 y 20 caracteres'
        });
        return;
      }

      const is_available = await auth_service.is_handle_available(handle, exclude_user_id);

      res.status(200).json({
        success: true,
        data: {
          handle,
          available: is_available
        }
      });
    } catch (error) {
      logger.error('Error verificando handle:', error);
      res.status(500).json({
        success: false,
        error: 'Error interno',
        message: 'Error verificando disponibilidad del handle'
      });
    }
  }
}

export const auth_controller = new AuthController();

