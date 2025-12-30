import { Router, type Request, type Response } from "express";
import { env } from "../config/environment";
import logger from "../config/logger";

const router = Router();

/**
 * Ruta de información básica de la API
 */
router.get("/info", (req: Request, res: Response) => {
  const info_data = {
    success: true,
    data: {
      app_name: env.APP_NAME,
      version: env.VERSION,
      environment: env.NODE_ENV,
      description:
        "API para gestión de equipos, jugadores y partidos de fútbol",
      timestamp: new Date().toISOString(),
      features: [
        "Gestión de equipos",
        "Gestión de jugadores",
        "Gestión de partidos",
        "Estadísticas de fútbol",
        "Sistema de autenticación",
      ],
    },
  };

  logger.info("Información de API solicitada", {
    ip: req.ip,
    user_agent: req.get("User-Agent"),
  });

  res.status(200).json(info_data);
});

/**
 * Ruta de ping para verificar conectividad
 */
router.get("/ping", (req: Request, res: Response) => {
  const ping_data = {
    success: true,
    data: "pong",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  };

  logger.debug("Ping solicitado", {
    ip: req.ip,
    user_agent: req.get("User-Agent"),
  });

  res.status(200).json(ping_data);
});

/**
 * Ruta de estado del servidor
 */
router.get("/status", (_req: Request, res: Response) => {
  const status_data = {
    success: true,
    data: {
      app_name: env.APP_NAME,
      status: "running",
      timestamp: new Date().toISOString(),
      version: env.VERSION,
      environment: env.NODE_ENV,
      uptime: {
        value: process.uptime(),
        days: Math.floor(process.uptime() / (24 * 60 * 60)),
        hours: Math.floor((process.uptime() % (24 * 60 * 60)) / (60 * 60)),
        minutes: Math.floor((process.uptime() % (60 * 60)) / 60),
        seconds: Math.floor(process.uptime() % 60),
        milliseconds: Math.floor(process.uptime() * 1000),
      },
      memory: {
        used:
          Math.round(process.memoryUsage().heapUsed / (1024 * 1024)) + " MB",
        total:
          Math.round(process.memoryUsage().heapTotal / (1024 * 1024)) + " MB",
        external:
          Math.round(process.memoryUsage().external / (1024 * 1024)) + " MB",
        rss: Math.round(process.memoryUsage().rss / (1024 * 1024)) + " MB",
      },
    },
  };

  res.status(200).json(status_data);
});

export default router;
