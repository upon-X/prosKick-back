import { createWriteStream } from "fs";
import { join } from "path";
import { env } from "./environment";
import { e_node_env } from "./environment";

// Configuración de logging simple y efectiva
export const logger = {
  info: (message: string, meta?: Record<string, unknown>) => {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] INFO: ${message}${
      meta ? ` ${JSON.stringify(meta, null, 2)}` : ""
    }`;
    console.log(logMessage);

    // En producción, también escribir a archivo
    if (env.NODE_ENV === e_node_env.production) {
      const logStream = createWriteStream(join(process.cwd(), env.LOG_FILE), {
        flags: "a",
      });
      logStream.write(logMessage + "\n");
      logStream.end();
    }
  },

  warn: (message: string, meta?: Record<string, unknown>) => {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] WARN: ${message}${
      meta ? ` ${JSON.stringify(meta, null, 2)}` : ""
    }`;
    console.warn(logMessage);

    if (env.NODE_ENV === e_node_env.production) {
      const logStream = createWriteStream(join(process.cwd(), env.LOG_FILE), {
        flags: "a",
      });
      logStream.write(logMessage + "\n");
      logStream.end();
    }
  },

  error: (
    message: string,
    error?: Error | unknown,
    meta?: Record<string, unknown>
  ) => {
    const timestamp = new Date().toISOString();
    const errorDetails = error instanceof Error ? error.stack : String(error);
    const logMessage = `[${timestamp}] ERROR: ${message}${
      meta ? ` ${JSON.stringify(meta, null, 2)}` : ""
    }${errorDetails ? `\n${errorDetails}` : ""}`;
    console.error(logMessage);

    if (env.NODE_ENV === e_node_env.production) {
      const logStream = createWriteStream(join(process.cwd(), env.LOG_FILE), {
        flags: "a",
      });
      logStream.write(logMessage + "\n");
      logStream.end();
    }
  },

  debug: (message: string, meta?: Record<string, unknown>) => {
    if (env.NODE_ENV === e_node_env.development) {
      const timestamp = new Date().toISOString();
      const logMessage = `[${timestamp}] DEBUG: ${message}${
        meta ? ` ${JSON.stringify(meta, null, 2)}` : ""
      }`;
      console.debug(logMessage);
    }
  },
};

export default logger;
