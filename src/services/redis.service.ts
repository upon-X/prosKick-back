import { Redis } from "ioredis";
import { env } from "../config/environment";
import logger from "../config/logger";

/**
 * Servicio singleton de Redis para la aplicación
 */
class RedisService {
  private client: Redis | null = null;
  private is_connected: boolean = false;

  /**
   * Inicializa la conexión a Redis
   */
  async connect(): Promise<void> {
    if (this.client) {
      logger.warn("Redis client already initialized");
      return;
    }

    try {
      this.client = new Redis(env.REDIS_URL, {
        maxRetriesPerRequest: null, // Requerido por BullMQ
        retryStrategy: (times) => {
          const delay = Math.min(times * 50, 2000);
          return delay;
        },
        reconnectOnError: (err) => {
          const targetError = "READONLY";
          if (err.message.includes(targetError)) {
            // Reconectar en caso de error READONLY
            return true;
          }
          return false;
        },
      });

      this.client.on("connect", () => {
        this.is_connected = true;
        logger.info("Redis connected successfully");
      });

      this.client.on("error", (error) => {
        // Solo logear en producción o si estamos conectados
        if (env.NODE_ENV !== "development" || this.is_connected) {
          logger.error("Redis connection error:", error);
        }
        this.is_connected = false;
      });

      this.client.on("close", () => {
        if (env.NODE_ENV !== "development" || this.is_connected) {
          logger.warn("Redis connection closed");
        }
        this.is_connected = false;
      });

      // Verificar conexión
      await this.client.ping();
    } catch (error) {
      logger.error("Failed to connect to Redis:", error);
      this.client = null;
      this.is_connected = false;

      // En desarrollo, permitir que la app continúe sin Redis
      if (env.NODE_ENV === "development") {
        logger.warn(
          "Running in development mode without Redis - some features may be limited"
        );
      } else {
        throw new Error("Redis connection failed");
      }
    }
  }

  /**
   * Obtiene el cliente de Redis
   */
  get_client(): Redis | null {
    if (!this.client) {
      logger.warn("Redis client not available");
      return null;
    }
    return this.client;
  }

  /**
   * Verifica si Redis está conectado
   */
  is_ready(): boolean {
    return this.is_connected && this.client !== null;
  }

  /**
   * Cierra la conexión a Redis
   */
  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.quit();
      this.client = null;
      this.is_connected = false;
      logger.info("Redis disconnected");
    }
  }

  /**
   * Ping a Redis para verificar conexión
   */
  async ping(): Promise<boolean> {
    try {
      if (!this.client) return false;
      const response = await this.client.ping();
      return response === "PONG";
    } catch (error) {
      logger.error("Redis ping failed:", error);
      return false;
    }
  }
}

// Exportar instancia singleton
export const redis_service = new RedisService();
