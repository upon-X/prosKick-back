import mongoose from "mongoose";
import { env } from "../config/environment";
import logger from "../config/logger";

/**
 * Configuración de conexión a MongoDB
 */
const mongo_config = {
  uri: env.MONGO_DB_URI,
  options: {
    maxPoolSize: 10, // Mantener hasta 10 conexiones en el pool
    serverSelectionTimeoutMS: 5000, // Mantener intentos por 5 segundos
    socketTimeoutMS: 45000, // Cerrar sockets después de 45 segundos de inactividad
    dbName: env.MONGO_DB_NAME,
  },
};

/**
 * Servicio de base de datos
 */
class DatabaseService {
  private is_connected = false;
  private connection_attempts = 0;
  private max_retries = 5;

  /**
   * Conectar a la base de datos
   */
  async connect(): Promise<void> {
    if (this.is_connected) {
      logger.info("Base de datos ya está conectada");
      return;
    }

    try {
      logger.info("Conectando a MongoDB...", {
        uri: mongo_config.uri.replace(/\/\/.*@/, "//***:***@"), // Ocultar credenciales en logs
        environment: env.NODE_ENV,
      });

      await mongoose.connect(mongo_config.uri, mongo_config.options);

      this.is_connected = true;
      this.connection_attempts = 0;

      logger.info("Conexión a MongoDB establecida exitosamente", {
        ready_state: mongoose.connection.readyState,
      });

      // Configurar event listeners
      this.setup_event_listeners();
    } catch (error) {
      this.connection_attempts++;

      logger.error("Error conectando a MongoDB", error, {
        attempt: this.connection_attempts,
        max_retries: this.max_retries,
      });

      if (this.connection_attempts < this.max_retries) {
        logger.info(
          `Reintentando conexión en 5 segundos... (${this.connection_attempts}/${this.max_retries})`
        );
        setTimeout(() => this.connect(), 5000);
      } else {
        throw new Error(
          `No se pudo conectar a MongoDB después de ${this.max_retries} intentos`
        );
      }
    }
  }

  /**
   * Desconectar de la base de datos
   */
  async disconnect(): Promise<void> {
    if (!this.is_connected) {
      logger.info("Base de datos ya está desconectada");
      return;
    }

    try {
      logger.info("Desconectando de MongoDB...");

      await mongoose.disconnect();
      this.is_connected = false;

      logger.info("Desconexión de MongoDB completada");
    } catch (error) {
      logger.error("Error desconectando de MongoDB", error);
      throw error;
    }
  }

  /**
   * Verificar estado de la conexión
   */
  is_healthy(): boolean {
    return this.is_connected && mongoose.connection.readyState === 1;
  }

  /**
   * Obtener información de la conexión
   */
  get_connection_info(): Record<string, unknown> {
    return {
      is_connected: this.is_connected,
      ready_state: mongoose.connection.readyState,
      host: mongoose.connection.host,
      port: mongoose.connection.port,
      database: mongoose.connection.name,
      collections: Object.keys(mongoose.connection.collections),
    };
  }

  /**
   * Configurar event listeners para la conexión
   */
  private setup_event_listeners(): void {
    mongoose.connection.on("connected", () => {
      logger.info("MongoDB conectado");
      this.is_connected = true;
    });

    mongoose.connection.on("error", (error) => {
      logger.error("Error de conexión MongoDB", error);
      this.is_connected = false;
    });

    mongoose.connection.on("disconnected", () => {
      logger.warn("MongoDB desconectado");
      this.is_connected = false;
    });

    mongoose.connection.on("reconnected", () => {
      logger.info("MongoDB reconectado");
      this.is_connected = true;
    });

    // Manejar cierre graceful
    process.on("SIGINT", async () => {
      await this.disconnect();
      process.exit(0);
    });

    process.on("SIGTERM", async () => {
      await this.disconnect();
      process.exit(0);
    });
  }
}

// Exportar instancia singleton
export const db = new DatabaseService();
export default db;
