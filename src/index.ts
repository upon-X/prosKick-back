/**
 * @fileoverview Servidor principal de Futbol App
 *
 * Este archivo configura y ejecuta el servidor Express para la aplicación de fútbol,
 * implementando los endpoints requeridos: /health, /info, /ping y /status.
 *
 * @author Futbol App Team
 * @version 1.0.0
 */

import express from "express";
import { createServer, Server } from "http";
import cookieParser from "cookie-parser";
import logger from "./config/logger";
import { env } from "./config/environment";
import {
  cors_middleware,
  helmet_middleware,
  rate_limit_middleware,
  additional_security_middleware,
} from "./middleware/security.middleware";
import {
  error_handler,
  not_found_handler,
  health_check_middleware,
} from "./middleware/error.middleware";
import {
  timing_middleware,
  add_timing_to_response,
} from "./middleware/timing.middleware";
import { create_main_router } from "./routes";
import { db } from "./services/database.service";
import { firebase_service } from "./services/firebase.service";
import { redis_service } from "./services/redis.service";
import { refresh_queue_service } from "./services/refresh_queue.service";

/**
 * Configura los middlewares de Express en el orden correcto
 *
 * Esta función configura todos los middlewares necesarios para la aplicación de fútbol,
 * siguiendo el patrón de seguridad en capas. El orden es crítico:
 * 1. Trust proxy (para obtener IP real)
 * 2. Middleware de timing (medir duración de peticiones)
 * 3. Seguridad adicional (headers, validaciones)
 * 4. CORS (control de acceso)
 * 5. Helmet (headers de seguridad HTTP)
 * 6. Rate limiting (protección contra abuso)
 * 7. Parsers de datos (JSON y URL encoded)
 * 8. Health check (verificación de estado del servidor)
 *
 * @param {express.Application} app - Aplicación Express a configurar
 * @returns {void}
 */
const configure_middlewares = (app: express.Application): void => {
  logger.info("Configurando middlewares del servidor");

  // 1. Configurar proxy para obtener IP real del cliente
  // Necesario cuando el servidor está detrás de un proxy/load balancer
  app.set("trust proxy", 1);

  // 2. Middleware de timing
  // Añade timestamps y mide duración de peticiones
  app.use(timing_middleware);

  // 3. Middleware de seguridad adicional
  // Configura headers de seguridad y valida tamaño de payload
  app.use(additional_security_middleware);

  // 4. CORS (Cross-Origin Resource Sharing)
  // Permite peticiones desde orígenes específicos configurados
  app.use(cors_middleware);

  // 5. Helmet para headers de seguridad HTTP
  // Configura headers como X-Content-Type-Options, X-Frame-Options, etc.
  app.use(helmet_middleware);

  // 6. Rate limiting general
  // Limita el número de peticiones por IP para prevenir abuso
  app.use(rate_limit_middleware);

  // 7. Cookie parser
  // Parsea cookies de las peticiones HTTP
  app.use(cookieParser());

  // 8. Parser JSON con límite de 10MB
  // Parsea el cuerpo de las peticiones JSON con límite de tamaño
  app.use(express.json({ limit: "10mb" }));

  // 9. Parser URL encoded
  // Parsea datos de formularios con límite de tamaño
  app.use(express.urlencoded({ extended: true, limit: "10mb" }));

  // 10. Middleware de timing para respuestas JSON
  // Añade información de timing a las respuestas JSON
  app.use(add_timing_to_response);

  // 11. Middleware de verificación de salud del servidor
  // Verifica que el servidor esté completamente iniciado antes de procesar peticiones
  app.use(health_check_middleware);

  logger.info("Middlewares configurados exitosamente");
};

/**
 * Configura las rutas de la API de fútbol
 *
 * Esta función utiliza el router principal modularizado que organiza
 * todas las rutas en módulos separados:
 * - Health check
 * - Información de la API
 * - Ping/Status
 * - Rutas de equipos, jugadores, partidos (futuras)
 *
 * @param {express.Application} app - Aplicación Express a configurar
 * @returns {void}
 */
const configure_routes = (app: express.Application): void => {
  logger.info("Configurando rutas de la API");

  // Usar el router principal modularizado
  app.use(create_main_router());

  logger.info("Rutas configuradas exitosamente");
};

/**
 * Configura el manejo de errores
 * Función pura que configura el manejo de errores
 *
 * @param {express.Application} app - Aplicación Express
 */
const configure_error_handling = (app: express.Application): void => {
  logger.info("Configurando manejo de errores");

  // Middleware para rutas no encontradas
  app.use(not_found_handler);

  // Middleware global de manejo de errores
  app.use(error_handler);

  logger.info("Manejo de errores configurado exitosamente");
};

/**
 * Crea una aplicación Express configurada
 * Función pura que retorna una aplicación completamente configurada
 *
 * @returns {express.Application} Aplicación Express configurada
 */
const create_application = (): express.Application => {
  const app = express();

  configure_middlewares(app);
  configure_routes(app);
  configure_error_handling(app);

  return app;
};

/**
 * Inicia el servidor HTTP
 * Función pura que inicia el servidor y retorna una promesa
 *
 * @param {express.Application} app - Aplicación Express
 * @returns {Promise<Server>} Promesa que resuelve con el servidor
 */
const start_server = (app: express.Application): Promise<Server> => {
  return new Promise((resolve, reject) => {
    try {
      logger.info("Iniciando servidor Futbol App");

      const server = createServer(app);

      server.listen(env.PORT, () => {
        // Marcar servidor como listo
        process.env.SERVER_READY = "true";

        logger.info("Servidor iniciado exitosamente", {
          port: env.PORT,
          environment: env.NODE_ENV,
          app_name: env.APP_NAME,
          version: env.VERSION,
          timestamp: new Date().toISOString(),
        });

        console.log(`
⚽ Futbol App iniciado exitosamente!

📡 Servidor ejecutándose en: http://localhost:${env.PORT}
🌍 Entorno: ${env.NODE_ENV}
❤️  Health Check: http://localhost:${env.PORT}/health

📋 Endpoints disponibles:
  GET  /health              - Verificación de salud del servidor
  GET  /info                - Información de la API
  GET  /ping                - Ping del servidor
  GET  /status              - Estado del servidor
  POST /auth/login          - Autenticación con Google
  GET  /auth/me             - Perfil del usuario
  PATCH /auth/profile       - Actualizar perfil
  GET  /                    - Información general

⚽ Aplicación: Futbol App
📊 Versión: ${env.VERSION}
        `);

        resolve(server);
      });

      server.on("error", (error: Error) => {
        logger.error("Error del servidor:", error);
        reject(error);
      });
    } catch (error) {
      logger.error("Error iniciando servidor:", error);
      reject(error);
    }
  });
};

/**
 * Configura el cierre graceful del servidor
 * Función pura que configura los manejadores de cierre
 *
 * @param {Server} server - Servidor HTTP
 */
const configure_graceful_shutdown = (server: Server): void => {
  const shutdown_server = async (): Promise<void> => {
    try {
      logger.info("Cerrando servidor...");

      // Marcar servidor como no listo
      process.env.SERVER_READY = "false";

      // Cerrar refresh queue y Redis
      await refresh_queue_service.close();
      await redis_service.disconnect();

      // Desconectar base de datos
      await db.disconnect();

      server.close(() => {
        logger.info("Servidor cerrado exitosamente");
        process.exit(0);
      });
    } catch (error) {
      logger.error("Error cerrando servidor:", error);
      process.exit(1);
    }
  };

  process.on("SIGTERM", shutdown_server);
  process.on("SIGINT", shutdown_server);
};

/**
 * Función principal para iniciar la aplicación
 * Composición de funciones puras
 */
const start_application = async (): Promise<void> => {
  try {
    // Inicializar Firebase Admin SDK
    firebase_service.initialize();

    // Conectar a la base de datos
    await db.connect();

    // Conectar a Redis (opcional en desarrollo)
    await redis_service.connect();

    // Inicializar refresh queue (solo si Redis está disponible)
    if (redis_service.is_ready()) {
      await refresh_queue_service.initialize();
    } else {
      logger.warn(
        "Skipping refresh queue initialization - Redis not available"
      );
    }

    const app = create_application();
    const server = await start_server(app);
    configure_graceful_shutdown(server);
  } catch (error) {
    logger.error("Error fatal iniciando servidor:", error);
    process.exit(1);
  }
};

// Iniciar aplicación
start_application();

export { create_application, start_server, configure_graceful_shutdown };
