import type { Request, Response, NextFunction } from "express";
import { env } from "../config/environment";
import logger from "../config/logger";

/**
 * Interfaz para errores personalizados
 */
interface CustomError extends Error {
  status_code?: number;
  is_operational?: boolean;
}

/**
 * Middleware para manejar rutas no encontradas
 */
export const not_found_handler = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const error: CustomError = new Error(`Ruta no encontrada: ${req.originalUrl}`);
  error.status_code = 404;
  error.is_operational = true;
  
  logger.warn("Ruta no encontrada", {
    method: req.method,
    url: req.originalUrl,
    ip: req.ip,
    user_agent: req.get("User-Agent"),
  });
  
  next(error);
};

/**
 * Middleware global de manejo de errores
 */
export const error_handler = (
  error: CustomError,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  // Establecer status code por defecto
  const status_code = error.status_code || 500;
  
  // Determinar si es un error operacional
  const is_operational = error.is_operational || false;
  
  // Log del error
  if (status_code >= 500) {
    logger.error("Error interno del servidor", error, {
      method: req.method,
      url: req.originalUrl,
      ip: req.ip,
      user_agent: req.get("User-Agent"),
      body: req.body,
      query: req.query,
      params: req.params,
    });
  } else {
    logger.warn("Error del cliente", {
      message: error.message,
      status_code,
      method: req.method,
      url: req.originalUrl,
      ip: req.ip,
    });
  }
  
  // Preparar respuesta de error
  const error_response: Record<string, unknown> = {
    error: true,
    message: is_operational ? error.message : "Error interno del servidor",
    status_code,
    timestamp: new Date().toISOString(),
    path: req.originalUrl,
  };
  
  // En desarrollo, incluir stack trace
  if (env.NODE_ENV === "development") {
    error_response.stack = error.stack;
    error_response.details = {
      method: req.method,
      body: req.body,
      query: req.query,
      params: req.params,
    };
  }
  
  // En producción, no exponer detalles internos
  if (env.NODE_ENV === "production" && status_code >= 500) {
    error_response.message = "Error interno del servidor";
    delete error_response.stack;
  }
  
  res.status(status_code).json(error_response);
};

/**
 * Middleware de verificación de salud del servidor
 */
export const health_check_middleware = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  // Verificar que el servidor esté completamente iniciado
  if (process.env.SERVER_READY !== "true") {
    res.status(503).json({
      error: true,
      message: "Servidor no está listo",
      status_code: 503,
      timestamp: new Date().toISOString(),
    });
    return;
  }
  
  next();
};

/**
 * Wrapper para manejar errores asíncronos
 */
export const async_handler = (
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>
) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};
