import type { Request, Response, NextFunction } from 'express';
import { firebase_service } from '../services/firebase.service';
import { auth_service } from '../services/auth.service';
import { User } from '../models/user.model';
import logger from '../config/logger';

// Extender la interfaz Request para incluir user
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email?: string | undefined;
        roles: string[];
        player_profile?: any;
      };
    }
  }
}

/**
 * Middleware de autenticación con Firebase
 */
export const authenticate_token = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const auth_header = req.headers.authorization;
    const token = auth_header && auth_header.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      res.status(401).json({
        error: 'Token de acceso requerido',
        message: 'Debes incluir un token de autorización'
      });
      return;
    }

    // Verificar token con Firebase
    const decoded_token = await firebase_service.verify_id_token(token);
    
    // Buscar usuario en nuestra DB por providers.sub
    const user = await User.findOne({
      'providers.sub': decoded_token.uid,
      'providers.type': 'google'
    });
    
    if (!user) {
      res.status(401).json({
        error: 'Usuario no encontrado',
        message: 'El usuario no existe en nuestra base de datos'
      });
      return;
    }

    // Obtener perfil de jugador
    const player_profile = await auth_service.get_player_profile_by_user_id(user._id.toString());

    // Agregar información del usuario a la request
    req.user = {
      id: user._id,
      email: user.email || undefined,
      roles: user.roles,
      player_profile: player_profile
    };

    next();
  } catch (error) {
    logger.error('Error en autenticación:', error);
    
    if (error instanceof Error && error.message.includes('Token inválido')) {
      res.status(401).json({
        error: 'Token inválido',
        message: 'El token de acceso no es válido o ha expirado'
      });
    } else {
      res.status(500).json({
        error: 'Error de autenticación',
        message: 'Error interno del servidor'
      });
    }
  }
};

/**
 * Middleware para verificar roles específicos
 */
export const require_role = (roles: string[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        error: 'No autenticado',
        message: 'Debes estar autenticado para acceder a este recurso'
      });
      return;
    }

    const has_role = roles.some(role => req.user!.roles.includes(role));
    
    if (!has_role) {
      res.status(403).json({
        error: 'Acceso denegado',
        message: 'No tienes permisos para acceder a este recurso'
      });
      return;
    }

    next();
  };
};

/**
 * Middleware opcional de autenticación (no falla si no hay token)
 */
export const optional_authenticate = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const auth_header = req.headers.authorization;
    const token = auth_header && auth_header.split(' ')[1];

    if (!token) {
      next();
      return;
    }

    // Verificar token con Firebase
    const decoded_token = await firebase_service.verify_id_token(token);
    
    // Buscar usuario en nuestra DB por providers.sub
    const user = await User.findOne({
      'providers.sub': decoded_token.uid,
      'providers.type': 'google'
    });
    
    if (user) {
      // Obtener perfil de jugador
      const player_profile = await auth_service.get_player_profile_by_user_id(user._id.toString());

      // Agregar información del usuario a la request
      req.user = {
        id: user._id,
        email: user.email || undefined,
        roles: user.roles,
        player_profile: player_profile
      };
    }

    next();
  } catch (error) {
    // En caso de error, continuar sin usuario autenticado
    logger.warn('Error en autenticación opcional:', { error: String(error) });
    next();
  }
};

