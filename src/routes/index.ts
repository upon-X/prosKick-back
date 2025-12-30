import { Router } from "express";
import type { Request, Response } from "express";
import info_routes from "./info_routes";
import { auth_routes } from "./auth.routes";
import { canchas_routes } from "./canchas.routes";
import { organizer_requests_routes } from "./organizer_requests.routes";
import logger from "../config/logger";

/**
 * Crear el router principal de la aplicación
 * Función pura que retorna un router configurado
 * 
 * @returns {Router} Router principal configurado
 */
export const create_main_router = (): Router => {
  const router = Router();

  // Ruta de información de la API
  router.use("/", info_routes);
  
  // Rutas de autenticación
  router.use("/auth", auth_routes);
  
  // Rutas de canchas
  router.use("/", canchas_routes);
  
  // Rutas de solicitudes de organizadores
  router.use("/organizer-requests", organizer_requests_routes);

  // Ruta de health check
  router.get("/health", (req: Request, res: Response) => {
    const health_data = {
      status: "ok",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV,
      version: process.env.VERSION || "1.0.0",
      database: {
        connected: true, // Se actualizará dinámicamente
        ready_state: 1,
      },
      memory: {
        used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
        external: Math.round(process.memoryUsage().external / 1024 / 1024),
      },
    };

    logger.info("Health check solicitado", {
      ip: req.ip,
      user_agent: req.get("User-Agent"),
    });

    res.status(200).json(health_data);
  });

  // Ruta raíz con información de la API
  router.get("/", (req: Request, res: Response) => {
    const api_info = {
      name: "Futbol App API",
      version: "1.0.0",
      description: "API para gestión de equipos, jugadores y partidos de fútbol",
      environment: process.env.NODE_ENV,
      timestamp: new Date().toISOString(),
      endpoints: {
        health: "GET /health",
        info: "GET /info",
        auth: "POST /auth/login, GET /auth/me, PATCH /auth/profile",
        organizer_requests: "POST /organizer-requests, GET /organizer-requests, GET /organizer-requests/:id, PATCH /organizer-requests/:id/status",
        // Aquí podrías agregar más endpoints
      },
      documentation: "https://github.com/tu-usuario/futbol-app",
    };

    res.status(200).json(api_info);
  });

  return router;
};

// Exportar también como default para compatibilidad
export default create_main_router;
