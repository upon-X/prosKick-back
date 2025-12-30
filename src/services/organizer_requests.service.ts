import { OrganizerRequest } from "../models/organizer_requests.model";
import type { OrganizerRequestType } from "../models/organizer_requests.model";
import { ORGANIZER_REQUEST_STATUS } from "../types/organizers";
import logger from "../config/logger";
import type { ObjectId } from "mongoose";
import { STATUS_CODES } from "http";

export interface CreateRequestData {
  name: string;
  email: string;
  phone_number: string;
  location: {
    country: "AR";
    province: string;
    city: string;
    address: string;
    coordinates?:
      | {
          lat: number;
          lng: number;
        }
      | undefined;
  };
  image: string;
  user_id: string;
}

export interface UpdateRequestData {
  status?: string;
  rejection_reason?: string;
  notes?: string;
  reviewed_by?: {
    id: string;
    name: string;
  };
  location?: {
    coordinates?: {
      lat: number;
      lng: number;
    };
  };
}

export interface GetRequestsOptions {
  status?: string;
  page?: number;
  limit?: number;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export class OrganizerRequestService {
  constructor() {
    // Constructor vacío
  }

  /**
   * Transformar ObjectId a string para el frontend
   */
  private transformObjectIDToString(data: any): OrganizerRequestType {
    if (!data) return data;

    const transformed = { ...data };
    if (transformed._id) {
      transformed._id = transformed._id.toString();
    }
    return transformed as OrganizerRequestType;
  }

  /**
   * Crear una nueva solicitud de organizador
   */
  async createRequest(data: CreateRequestData): Promise<OrganizerRequestType> {
    try {
      // Verificar si ya existe una solicitud con este email
      const existingRequest = await OrganizerRequest.findOne({
        email: data.email,
      });
      if (existingRequest) {
        const error: any = new Error("Ya existe una solicitud con este email");
        error.statusCode = 409;
        throw error;
      }

      // Crear la solicitud
      const request = new OrganizerRequest({
        ...data,
        status: ORGANIZER_REQUEST_STATUS.PENDING_REVIEW,
        created_at: new Date(),
        updated_at: new Date(),
      });

      const savedRequest = await request.save();

      logger.info("Solicitud de organizador creada en base de datos", {
        requestId: savedRequest._id,
        email: savedRequest.email,
      });

      return this.transformObjectIDToString(savedRequest.toObject());
    } catch (error: any) {
      logger.error("Error creando solicitud de organizador en servicio", {
        error: JSON.stringify({
          message: error.message.slice(0, 300),
          statusCode: error.statusCode,
        }),
      });
      throw error;
    }
  }

  /**
   * Obtener todas las solicitudes con paginación
   */
  async getAllRequests(
    options: GetRequestsOptions = {}
  ): Promise<PaginatedResult<OrganizerRequestType>> {
    try {
      const { status, page = 1, limit = 10 } = options;
      const skip = (page - 1) * limit;

      // Construir filtro
      const filter: any = {};
      if (status) {
        filter.status = status;
      }

      // Obtener solicitudes con paginación
      const [requests, total] = await Promise.all([
        OrganizerRequest.find(filter)
          .sort({ created_at: -1 })
          .skip(skip)
          .limit(limit)
          .lean(),
        OrganizerRequest.countDocuments(filter),
      ]);

      const totalPages = Math.ceil(total / limit);

      logger.info("Solicitudes de organizador obtenidas", {
        count: requests.length,
        total,
        page,
        limit,
        status,
      });

      return {
        data: requests.map((request) =>
          this.transformObjectIDToString(request)
        ),
        total,
        page,
        limit,
        totalPages,
      };
    } catch (error: any) {
      logger.error("Error obteniendo solicitudes de organizador en servicio", {
        error: error.message,
        options,
      });
      throw error;
    }
  }

  /**
   * Obtener una solicitud por ID
   */
  async getRequestById(id: string): Promise<OrganizerRequestType | null> {
    try {
      const request = await OrganizerRequest.findById(id).lean();

      if (request) {
        logger.info("Solicitud de organizador obtenida por ID", {
          requestId: id,
          status: request.status,
        });
      }

      return request ? this.transformObjectIDToString(request) : null;
    } catch (error: any) {
      logger.error("Error obteniendo solicitud de organizador por ID", {
        error: error.message,
        requestId: id,
      });
      throw error;
    }
  }

  /**
   * Actualizar el estado de una solicitud
   */
  async updateRequestStatus(
    id: string,
    updateData: UpdateRequestData
  ): Promise<OrganizerRequestType | null> {
    try {
      // Si se está aprobando, validar que tenga coordenadas
      if (updateData.status === ORGANIZER_REQUEST_STATUS.APPROVED) {
        const currentRequest = await OrganizerRequest.findById(id);
        if (!currentRequest) {
          throw new Error("Solicitud no encontrada");
        }
        if (
          !currentRequest.location?.coordinates?.lat ||
          !currentRequest.location?.coordinates?.lng
        ) {
          throw new Error(
            "No se puede aprobar una solicitud sin coordenadas. Por favor agregue las coordenadas primero."
          );
        }
      }

      const updateFields: any = {
        ...updateData,
        updated_at: new Date(),
      };

      // Si se está aprobando o rechazando, agregar fecha de revisión
      if (
        updateData.status &&
        updateData.status !== ORGANIZER_REQUEST_STATUS.PENDING_REVIEW
      ) {
        updateFields.reviewed_at = new Date();
      }

      const request = await OrganizerRequest.findByIdAndUpdate(
        id,
        updateFields,
        { new: true, runValidators: true }
      ).lean();

      if (request) {
        logger.info("Estado de solicitud de organizador actualizado", {
          requestId: id,
          newStatus: updateData.status,
          reviewedBy: updateData.reviewed_by?.id,
        });
      }

      return request ? this.transformObjectIDToString(request as any) : null;
    } catch (error: any) {
      logger.error("Error actualizando estado de solicitud de organizador", {
        error: error.message,
        requestId: id,
        updateData,
      });
      throw error;
    }
  }

  /**
   * Obtener las solicitudes de un usuario específico
   */
  async getMyRequests(
    user_id: string,
    options: GetRequestsOptions = {}
  ): Promise<PaginatedResult<OrganizerRequestType>> {
    try {
      const { status, page = 1, limit = 10 } = options;
      const skip = (page - 1) * limit;

      // Construir filtro para el usuario específico
      const filter: { user_id: string; status?: string } = { user_id };
      if (status) {
        filter.status = status;
      }

      // Obtener solicitudes con paginación
      const [requests, total] = await Promise.all([
        OrganizerRequest.find(filter)
          .sort({ created_at: -1 })
          .skip(skip)
          .limit(limit)
          .lean(),
        OrganizerRequest.countDocuments(filter),
      ]);

      const totalPages = Math.ceil(total / limit);

      logger.info("Solicitudes de usuario obtenidas", {
        user_id,
        count: requests.length,
        total,
        page,
        limit,
        status,
      });

      return {
        data: requests.map((request) =>
          this.transformObjectIDToString(request)
        ),
        total,
        page,
        limit,
        totalPages,
      };
    } catch (error: any) {
      logger.error("Error obteniendo solicitudes del usuario en servicio", {
        error: error.message,
        user_id,
        options,
      });
      throw error;
    }
  }

  /**
   * Obtener estadísticas de solicitudes
   */
  async getRequestStats(): Promise<{
    total: number;
    pending: number;
    approved: number;
    rejected: number;
    pendingFix: number;
  }> {
    try {
      const [total, pending, approved, rejected, pendingFix] =
        await Promise.all([
          OrganizerRequest.countDocuments(),
          OrganizerRequest.countDocuments({
            status: ORGANIZER_REQUEST_STATUS.PENDING_REVIEW,
          }),
          OrganizerRequest.countDocuments({
            status: ORGANIZER_REQUEST_STATUS.APPROVED,
          }),
          OrganizerRequest.countDocuments({
            status: ORGANIZER_REQUEST_STATUS.REJECTED,
          }),
          OrganizerRequest.countDocuments({
            status: ORGANIZER_REQUEST_STATUS.PENDING_FIX,
          }),
        ]);

      return {
        total,
        pending,
        approved,
        rejected,
        pendingFix,
      };
    } catch (error: any) {
      logger.error("Error obteniendo estadísticas de solicitudes", {
        error: error.message,
      });
      throw error;
    }
  }
}
