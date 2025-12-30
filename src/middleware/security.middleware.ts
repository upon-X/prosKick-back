import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import type { Request, Response, NextFunction } from "express";
import { env } from "../config/environment";
import logger from "../config/logger";

/**
 * Configuración de CORS para la aplicación de fútbol
 */
export const cors_middleware = cors({
  origin: (origin, callback) => {
    // Permitir requests sin origin (mobile apps, Postman, etc.)
    if (!origin) return callback(null, true);
    
    const allowed_origins = [
      env.FRONTEND_URL,
      "http://localhost:3000",
      "http://localhost:3001",
    ];
    
    if (allowed_origins.includes(origin)) {
      callback(null, true);
    } else {
      logger.warn(`CORS bloqueado para origen: ${origin}`);
      callback(new Error("No permitido por CORS"));
    }
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "X-Requested-With",
    "Accept",
    "Origin",
  ],
});

/**
 * Configuración de Helmet para headers de seguridad
 */
export const helmet_middleware = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
  crossOriginEmbedderPolicy: false,
});

/**
 * Rate limiting general para prevenir abuso
 */
export const rate_limit_middleware = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 100, // máximo 100 requests por IP por ventana
  message: {
    error: "Demasiadas peticiones desde esta IP, intentá de nuevo más tarde",
    retry_after: "15 minutos",
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req: Request, res: Response) => {
    logger.warn(`Rate limit excedido para IP: ${req.ip}`, {
      ip: req.ip,
      user_agent: req.get("User-Agent"),
      path: req.path,
    });
    
    res.status(429).json({
      error: "Demasiadas peticiones",
      message: "Intentá de nuevo en 15 minutos",
      retry_after: 900,
    });
  },
});

/**
 * Middleware de seguridad adicional
 */
export const additional_security_middleware = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  // Validar tamaño del payload
  const content_length = req.get("content-length");
  if (content_length && parseInt(content_length) > 10 * 1024 * 1024) {
    res.status(413).json({
      error: "Payload demasiado grande",
      message: "El tamaño máximo permitido es 10MB",
    });
    return;
  }

  // Headers de seguridad adicionales
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");

  // Log de peticiones sospechosas
  const suspicious_patterns = [
    /\.\.\//, // Path traversal
    /<script/i, // XSS
    /union.*select/i, // SQL injection
    /javascript:/i, // JavaScript injection
  ];

  const url = req.url.toLowerCase();
  const user_agent = req.get("User-Agent")?.toLowerCase() || "";

  for (const pattern of suspicious_patterns) {
    if (pattern.test(url) || pattern.test(user_agent)) {
      logger.warn("Petición sospechosa detectada", {
        ip: req.ip,
        url: req.url,
        user_agent: req.get("User-Agent"),
        pattern: pattern.toString(),
      });
      break;
    }
  }

  next();
};
