import admin from 'firebase-admin';
import { env } from '../config/environment';
import logger from '../config/logger';

/**
 * Configuración del servicio Firebase Admin SDK
 */
class FirebaseService {
  private app: admin.app.App | null = null;

  /**
   * Inicializa Firebase Admin SDK
   */
  initialize(): void {
    try {
      if (this.app) {
        logger.warn('Firebase ya está inicializado');
        return;
      }

      const service_account = {
        type: 'service_account',
        project_id: env.FIREBASE_PROJECT_ID,
        private_key_id: env.FIREBASE_PRIVATE_KEY_ID,
        private_key: env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
        client_email: env.FIREBASE_CLIENT_EMAIL,
        client_id: env.FIREBASE_CLIENT_ID,
        auth_uri: 'https://accounts.google.com/o/oauth2/auth',
        token_uri: 'https://oauth2.googleapis.com/token',
        auth_provider_x509_cert_url: 'https://www.googleapis.com/oauth2/v1/certs',
        client_x509_cert_url: `https://www.googleapis.com/robot/v1/metadata/x509/${env.FIREBASE_CLIENT_EMAIL}`
      };

      this.app = admin.initializeApp({
        credential: admin.credential.cert(service_account as admin.ServiceAccount),
        projectId: env.FIREBASE_PROJECT_ID
      });

      logger.info('Firebase Admin SDK inicializado correctamente');
    } catch (error) {
      logger.error('Error inicializando Firebase Admin SDK:', error);
      throw new Error('No se pudo inicializar Firebase Admin SDK');
    }
  }

  /**
   * Verifica un ID token de Firebase
   * @param id_token - Token ID de Firebase
   * @returns Información del usuario verificado
   */
  async verify_id_token(id_token: string): Promise<admin.auth.DecodedIdToken> {
    try {
      if (!this.app) {
        throw new Error('Firebase no está inicializado');
      }

      const decoded_token = await admin.auth().verifyIdToken(id_token, true);

      logger.info('Token verificado correctamente', {
        uid: decoded_token.uid,
        email: decoded_token.email
      });

      return decoded_token;
    } catch (error) {
      logger.error('Error verificando token:', error);
      throw new Error('Token inválido o expirado');
    }
  }

  /**
   * Obtiene información del usuario desde Firebase
   * @param uid - UID del usuario en Firebase
   * @returns Información del usuario
   */
  async get_user(uid: string): Promise<admin.auth.UserRecord> {
    try {
      if (!this.app) {
        throw new Error('Firebase no está inicializado');
      }

      const user_record = await admin.auth().getUser(uid);
      return user_record;
    } catch (error) {
      logger.error('Error obteniendo usuario de Firebase:', error);
      throw new Error('Usuario no encontrado en Firebase');
    }
  }

  /**
   * Revoca todos los tokens de un usuario
   * @param uid - UID del usuario
   */
  async revoke_user_tokens(uid: string): Promise<void> {
    try {
      if (!this.app) {
        throw new Error('Firebase no está inicializado');
      }

      await admin.auth().revokeRefreshTokens(uid);
      logger.info('Tokens revocados para usuario', { uid });
    } catch (error) {
      logger.error('Error revocando tokens:', error);
      throw new Error('No se pudieron revocar los tokens');
    }
  }

  /**
   * Obtiene la instancia de la app de Firebase
   */
  get_app(): admin.app.App {
    if (!this.app) {
      throw new Error('Firebase no está inicializado');
    }
    return this.app;
  }
}

export const firebase_service = new FirebaseService();

