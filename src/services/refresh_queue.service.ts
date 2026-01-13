import { Queue, Worker, Job, QueueEvents } from "bullmq";
import { redis_service } from "./redis.service";
import { jwt_service, type ITokenRotationResult } from "./jwt.service";
import logger from "../config/logger";

/**
 * Datos del job de refresh token
 */
interface IRefreshTokenJobData {
  refresh_token: string;
}

/**
 * Servicio de cola para manejar el refresh de tokens
 * Usa BullMQ con Redis para evitar race conditions
 */
class RefreshQueueService {
  private queue: Queue<IRefreshTokenJobData> | null = null;
  private worker: Worker<IRefreshTokenJobData, ITokenRotationResult> | null =
    null;
  private queueEvents: QueueEvents | null = null;
  private is_initialized: boolean = false;

  /**
   * Inicializa la cola y el worker de BullMQ
   */
  async initialize(): Promise<void> {
    if (this.is_initialized) {
      logger.warn("Refresh queue already initialized");
      return;
    }

    try {
      const connection = redis_service.get_client();

      if (!connection) {
        logger.warn("Cannot initialize refresh queue - Redis not available");
        return;
      }

      // Crear la cola
      this.queue = new Queue<IRefreshTokenJobData>("refresh-token", {
        connection,
        defaultJobOptions: {
          attempts: 3,
          backoff: {
            type: "exponential",
            delay: 1000,
          },
          removeOnComplete: {
            age: 3600, // Mantener completados por 1 hora
            count: 100,
          },
          removeOnFail: {
            age: 86400, // Mantener fallidos por 24 horas
          },
        },
      });

      // Crear QueueEvents para escuchar eventos de jobs
      this.queueEvents = new QueueEvents("refresh-token", {
        connection,
      });

      // Crear el worker para procesar jobs
      this.worker = new Worker<IRefreshTokenJobData, ITokenRotationResult>(
        "refresh-token",
        async (job: Job<IRefreshTokenJobData>) => {
          return await this.process_refresh_job(job);
        },
        {
          connection,
          concurrency: 5, // Procesar hasta 5 jobs simultáneos
        }
      );

      // Event listeners del worker
      this.worker.on("completed", (job) => {
        logger.info(`Refresh token job completed: ${job.id}`);
      });

      this.worker.on("failed", (job, err) => {
        logger.error(`Refresh token job failed: ${job?.id}`, err);
      });

      this.worker.on("error", (err) => {
        logger.error("Refresh worker error:", err);
      });

      this.is_initialized = true;
      logger.info("Refresh queue service initialized successfully");
    } catch (error) {
      logger.error("Failed to initialize refresh queue:", error);
      throw new Error("Refresh queue initialization failed");
    }
  }

  /**
   * Procesa un job de refresh token
   */
  private async process_refresh_job(
    job: Job<IRefreshTokenJobData>
  ): Promise<ITokenRotationResult> {
    const { refresh_token } = job.data;

    try {
      logger.info(`Processing refresh token job: ${job.id}`);

      // Llamar al servicio JWT para rotar el token
      const result = await jwt_service.rotate_refresh_token(refresh_token);

      if (!result.success) {
        logger.warn(`Token rotation failed for job ${job.id}: ${result.error}`);
      }

      return result;
    } catch (error) {
      logger.error(`Error processing refresh job ${job.id}:`, error);
      return {
        success: false,
        error: "Internal error during token refresh",
        should_logout: false,
      };
    }
  }

  /**
   * Agrega un job de refresh token a la cola
   * Usa el hash del token como jobId para deduplicación automática
   */
  async add_refresh_job(refresh_token: string): Promise<ITokenRotationResult> {
    if (!this.queue) {
      logger.warn(
        "Refresh queue not available - executing token rotation directly"
      );
      return await jwt_service.rotate_refresh_token(refresh_token);
    }

    try {
      // Usar un hash simple del token como jobId para deduplicación
      const job_id = this.create_job_id(refresh_token);

      // Agregar el job a la cola
      const job = await this.queue.add(
        "refresh",
        { refresh_token },
        {
          jobId: job_id,
          // Si ya existe un job con este ID, no crear uno nuevo
        }
      );

      // Esperar a que el job se complete
      const result = await job.waitUntilFinished(
        this.queueEvents!,
        30000 // Timeout de 30 segundos
      );

      return result;
    } catch (error) {
      logger.error("Error adding refresh job to queue:", error);

      // Si hay error con la cola, ejecutar directamente como fallback
      logger.warn("Falling back to direct token rotation");
      return await jwt_service.rotate_refresh_token(refresh_token);
    }
  }

  /**
   * Crea un ID único para el job basado en el refresh token
   * Usado para deduplicación
   */
  private create_job_id(refresh_token: string): string {
    const crypto = require("crypto");
    return crypto
      .createHash("sha256")
      .update(refresh_token)
      .digest("hex")
      .substring(0, 32);
  }

  /**
   * Obtiene estadísticas de la cola
   */
  async get_queue_stats() {
    if (!this.queue) {
      return null;
    }

    try {
      const [waiting, active, completed, failed, delayed] = await Promise.all([
        this.queue.getWaitingCount(),
        this.queue.getActiveCount(),
        this.queue.getCompletedCount(),
        this.queue.getFailedCount(),
        this.queue.getDelayedCount(),
      ]);

      return {
        waiting,
        active,
        completed,
        failed,
        delayed,
        total: waiting + active + completed + failed + delayed,
      };
    } catch (error) {
      logger.error("Error getting queue stats:", error);
      return null;
    }
  }

  /**
   * Limpia la cola (útil para mantenimiento)
   */
  async clean_queue(): Promise<void> {
    if (!this.queue) {
      return;
    }

    try {
      await this.queue.drain(); // Eliminar jobs en espera
      await this.queue.clean(3600, 100, "completed"); // Limpiar completados
      await this.queue.clean(86400, 100, "failed"); // Limpiar fallidos
      logger.info("Queue cleaned successfully");
    } catch (error) {
      logger.error("Error cleaning queue:", error);
    }
  }

  /**
   * Cierra la cola y el worker
   */
  async close(): Promise<void> {
    try {
      if (this.worker) {
        await this.worker.close();
        this.worker = null;
      }

      if (this.queueEvents) {
        await this.queueEvents.close();
        this.queueEvents = null;
      }

      if (this.queue) {
        await this.queue.close();
        this.queue = null;
      }

      this.is_initialized = false;
      logger.info("Refresh queue service closed");
    } catch (error) {
      logger.error("Error closing refresh queue:", error);
    }
  }

  /**
   * Verifica si el servicio está inicializado
   */
  is_ready(): boolean {
    return this.is_initialized && this.queue !== null && this.worker !== null;
  }
}

// Exportar instancia singleton
export const refresh_queue_service = new RefreshQueueService();
