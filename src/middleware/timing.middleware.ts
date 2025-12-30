import type { Request, Response, NextFunction } from "express";

/**
 * Interfaz extendida para Request con timing
 */
interface RequestWithTiming extends Request {
  start_time?: number;
  request_id?: string;
}

/**
 * Middleware de timing para medir duración de peticiones
 */
export const timing_middleware = (
  req: RequestWithTiming,
  res: Response,
  next: NextFunction
): void => {
  // Generar ID único para la petición
  req.request_id = `req_${Date.now()}_${Math.random()
    .toString(36)
    .substr(2, 9)}`;

  // Registrar tiempo de inicio
  req.start_time = Date.now();

  // Añadir headers de timing
  res.setHeader("X-Request-ID", req.request_id);

  // Interceptar el evento 'close' para calcular duración (más seguro que 'finish')
  res.on("close", () => {
    if (req.start_time) {
      const duration = Date.now() - req.start_time;

      // Log de timing para peticiones lentas (>1s)
      if (duration > 1000) {
        console.warn(
          `Petición lenta detectada: ${req.method} ${req.originalUrl} - ${duration}ms`
        );
      }
    }
  });

  next();
};

/**
 * Middleware para añadir información de timing a respuestas JSON
 */
export const add_timing_to_response = (
  req: RequestWithTiming,
  res: Response,
  next: NextFunction
): void => {
  const original_json = res.json;

  res.json = function (body: unknown) {
    // Añadir información de timing al body si es un objeto
    if (body && typeof body === "object" && !Array.isArray(body)) {
      const body_obj = body as Record<string, unknown>;
      const existing_meta = body_obj.meta as
        | Record<string, unknown>
        | undefined;

      const body_with_timing = {
        ...body_obj,
        meta: {
          ...(existing_meta || {}),
          request_id: req.request_id,
          response_time: req.start_time ? Date.now() - req.start_time : 0,
          timestamp: new Date().toISOString(),
        },
      };

      return original_json.call(this, body_with_timing);
    }

    return original_json.call(this, body);
  };

  next();
};
