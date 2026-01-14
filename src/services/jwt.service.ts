import jwt from "jsonwebtoken";
import crypto from "crypto";
import { v4 as uuidv4 } from "uuid";
import { env } from "../config/environment";
import logger from "../config/logger";
import { RefreshToken, e_device_type } from "../models/refresh_token.model";

/**
 * Payload del Access Token
 */
export interface IAccessTokenPayload {
  user_id: string;
  type: "access";
}

/**
 * Payload del Refresh Token
 */
export interface IRefreshTokenPayload {
  user_id: string;
  family_id: string;
  device_type: e_device_type;
  type: "refresh";
}

/**
 * Par de tokens generados
 */
export interface ITokenPair {
  access_token: string;
  refresh_token: string;
  access_expires_in: string;
  refresh_expires_in: string;
}

/**
 * Resultado de rotación de token
 */
export interface ITokenRotationResult {
  success: boolean;
  tokens?: ITokenPair;
  error?: string;
  should_logout?: boolean; // True si se detectó reuso de token
}

class JWTService {
  /**
   * Hash SHA-256 de un token para almacenamiento seguro
   */
  private hash_token(token: string): string {
    return crypto.createHash("sha256").update(token).digest("hex");
  }

  /**
   * Calcula fecha de expiración basada en string (ej: "15m", "7d")
   */
  private calculate_expiry(expiry_string: string): Date {
    const now = Date.now();
    const unit = expiry_string.slice(-1);
    const value = parseInt(expiry_string.slice(0, -1), 10);

    const multipliers: Record<string, number> = {
      s: 1000,
      m: 60 * 1000,
      h: 60 * 60 * 1000,
      d: 24 * 60 * 60 * 1000,
    };

    const multiplier = multipliers[unit];
    if (!multiplier) {
      throw new Error(`Invalid expiry format: ${expiry_string}`);
    }

    return new Date(now + value * multiplier);
  }

  /**
   * Genera un par de tokens (access + refresh) para un usuario
   */
  async generate_token_pair(
    user_id: string,
    device_type: e_device_type = e_device_type.web,
    family_id?: string
  ): Promise<ITokenPair> {
    try {
      // Generar family_id si no se proporciona (nuevo login)
      const token_family_id = family_id || uuidv4();

      // Determinar expiración del refresh token según device type
      const refresh_expiry =
        device_type === e_device_type.mobile
          ? env.JWT_REFRESH_EXPIRY_MOBILE
          : env.JWT_REFRESH_EXPIRY_WEB;

      // 1. Generar Access Token
      const access_payload: IAccessTokenPayload = {
        user_id,
        type: "access",
      };

      const access_options: jwt.SignOptions = {
        expiresIn: env.JWT_ACCESS_EXPIRY as any,
      };

      const access_token = jwt.sign(
        access_payload,
        env.JWT_SECRET as jwt.Secret,
        access_options
      );

      // 2. Generar Refresh Token
      const refresh_payload: IRefreshTokenPayload = {
        user_id,
        family_id: token_family_id,
        device_type,
        type: "refresh",
      };

      const refresh_options: jwt.SignOptions = {
        expiresIn: refresh_expiry as any,
      };

      const refresh_token = jwt.sign(
        refresh_payload,
        env.JWT_REFRESH_SECRET as jwt.Secret,
        refresh_options
      );

      // 3. Almacenar hash del refresh token en MongoDB
      const token_hash = this.hash_token(refresh_token);
      const expires_at = this.calculate_expiry(refresh_expiry);

      await RefreshToken.create({
        user_id,
        token_hash,
        family_id: token_family_id,
        device_type,
        expires_at,
        is_revoked: false,
      });

      logger.info(
        `Token pair generated for user: ${user_id}, device: ${device_type}, family: ${token_family_id}`
      );

      return {
        access_token,
        refresh_token,
        access_expires_in: env.JWT_ACCESS_EXPIRY,
        refresh_expires_in: refresh_expiry,
      };
    } catch (error) {
      logger.error("Error generating token pair:", error);
      throw new Error("Failed to generate authentication tokens");
    }
  }

  /**
   * Verifica y decodifica un Access Token
   */
  async verify_access_token(token: string): Promise<IAccessTokenPayload> {
    try {
      const decoded = jwt.verify(
        token,
        env.JWT_SECRET as jwt.Secret
      ) as IAccessTokenPayload;

      if (decoded.type !== "access") {
        throw new Error("Invalid token type");
      }

      return decoded;
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        throw new Error("Access token expired");
      } else if (error instanceof jwt.JsonWebTokenError) {
        throw new Error("Invalid access token");
      }
      throw error;
    }
  }

  /**
   * Verifica y decodifica un Refresh Token
   */
  async verify_refresh_token(token: string): Promise<IRefreshTokenPayload> {
    try {
      const decoded = jwt.verify(
        token,
        env.JWT_REFRESH_SECRET as jwt.Secret
      ) as IRefreshTokenPayload;

      if (decoded.type !== "refresh") {
        throw new Error("Invalid token type");
      }

      return decoded;
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        throw new Error("Refresh token expired");
      } else if (error instanceof jwt.JsonWebTokenError) {
        throw new Error("Invalid refresh token");
      }
      throw error;
    }
  }

  /**
   * Rota un refresh token (implementa refresh token rotation)
   * Detecta reuso de tokens y revoca toda la familia si es necesario
   */
  async rotate_refresh_token(
    refresh_token: string
  ): Promise<ITokenRotationResult> {
    try {
      // 1. Verificar el refresh token
      const decoded = await this.verify_refresh_token(refresh_token);

      // 2. Buscar el token en la base de datos
      const token_hash = this.hash_token(refresh_token);
      const stored_token = await RefreshToken.findOne({ token_hash });

      // 3. DETECCIÓN DE REUSO: Token no encontrado o ya revocado
      if (!stored_token || stored_token.is_revoked) {
        logger.warn(
          `Token reuse detected! Revoking family: ${decoded.family_id}`
        );

        // Revocar toda la familia de tokens (posible ataque)
        await RefreshToken.updateMany(
          { family_id: decoded.family_id },
          { is_revoked: true }
        );

        return {
          success: false,
          error: "Token reuse detected. Please login again.",
          should_logout: true,
        };
      }

      // 4. Verificar que el token no haya expirado (double check)
      if (stored_token.expires_at < new Date()) {
        await RefreshToken.updateOne({ token_hash }, { is_revoked: true });
        return {
          success: false,
          error: "Refresh token expired",
          should_logout: false,
        };
      }

      // 5. Revocar el token actual (rotation)
      await RefreshToken.updateOne({ token_hash }, { is_revoked: true });

      // 6. Generar nuevo par de tokens (mantener la misma familia)
      const new_tokens = await this.generate_token_pair(
        decoded.user_id,
        decoded.device_type,
        decoded.family_id // Mantener el mismo family_id
      );

      logger.info(
        `Token rotated successfully for user: ${decoded.user_id}, family: ${decoded.family_id}`
      );

      return {
        success: true,
        tokens: new_tokens,
      };
    } catch (error) {
      logger.error("Error rotating refresh token:", error);

      if (
        error instanceof Error &&
        (error.message.includes("expired") || error.message.includes("invalid"))
      ) {
        return {
          success: false,
          error: error.message,
          should_logout: false,
        };
      }

      return {
        success: false,
        error: "Failed to refresh token",
        should_logout: false,
      };
    }
  }

  /**
   * Revoca un refresh token específico (para logout)
   */
  async revoke_refresh_token(refresh_token: string): Promise<boolean> {
    try {
      const token_hash = this.hash_token(refresh_token);
      const result = await RefreshToken.updateOne(
        { token_hash },
        { is_revoked: true }
      );

      return result.modifiedCount > 0;
    } catch (error) {
      logger.error("Error revoking refresh token:", error);
      return false;
    }
  }

  /**
   * Revoca todos los refresh tokens de un usuario (logout de todos los dispositivos)
   */
  async revoke_all_user_tokens(user_id: string): Promise<number> {
    try {
      const result = await RefreshToken.updateMany(
        { user_id, is_revoked: false },
        { is_revoked: true }
      );

      logger.info(
        `Revoked ${result.modifiedCount} tokens for user: ${user_id}`
      );
      return result.modifiedCount;
    } catch (error) {
      logger.error("Error revoking user tokens:", error);
      return 0;
    }
  }

  /**
   * Revoca toda una familia de tokens (en caso de detección de ataque)
   */
  async revoke_token_family(family_id: string): Promise<number> {
    try {
      const result = await RefreshToken.updateMany(
        { family_id, is_revoked: false },
        { is_revoked: true }
      );

      logger.warn(
        `Revoked token family: ${family_id} (${result.modifiedCount} tokens)`
      );
      return result.modifiedCount;
    } catch (error) {
      logger.error("Error revoking token family:", error);
      return 0;
    }
  }
}

// Exportar instancia singleton
export const jwt_service = new JWTService();
