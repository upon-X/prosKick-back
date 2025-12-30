import type { Request, Response } from "express";
import { OrganizerRequestService } from "../services/organizer_requests.service";
import { organizer_request_schema_zod } from "../models/organizer_requests.model";
import logger from "../config/logger";

export class OrganizerRequestsController {
  private organizerRequestService: OrganizerRequestService;

  constructor() {
    this.organizerRequestService = new OrganizerRequestService();
  }

  /**
   * Crear una nueva solicitud de organizador
   */
  createRequest = async (req: Request, res: Response): Promise<void> => {
    try {
      // Validar datos de entrada con Zod
      const inputData = organizer_request_schema_zod.parse(req.body);
      // Crear la solicitud
      const request = await this.organizerRequestService.createRequest(
        inputData
      );

      logger.info("Solicitud de organizador creada", {
        requestId: (request as any)._id,
        email: request.email,
        user_id: request.user_id,
        ip: req.ip,
      });

      res.status(201).json({
        success: true,
        message: "Solicitud enviada correctamente",
        data: {
          id: (request as any)._id,
          status: request.status,
          created_at: request.created_at,
        },
      });
    } catch (error: any) {
      logger.error(
        "Error creando solicitud de organizador",
        JSON.stringify({
          error: error.message.slice(0, 300),
          body:
            typeof req.body === "string"
              ? req.body.slice(0, 300)
              : JSON.stringify(req.body).slice(0, 300),
          ip: req.ip,
        })
      );
      res.status(error.statusCode || 500).json({
        success: false,
        message: error.message,
      });
      return;
    }
  };

  /**
   * Obtener todas las solicitudes (solo para administradores)
   */
  getAllRequests = async (req: Request, res: Response): Promise<void> => {
    try {
      const { status, page = 1, limit = 10 } = req.query;

      const requests = await this.organizerRequestService.getAllRequests({
        status: status as string,
        page: Number(page),
        limit: Number(limit),
      });

      logger.info("Solicitudes de organizador consultadas", {
        count: requests.data.length,
        total: requests.total,
        ip: req.ip,
      });

      res.status(200).json({
        success: true,
        data: requests,
      });
    } catch (error: any) {
      logger.error("Error obteniendo solicitudes de organizador", {
        error: error.message,
        ip: req.ip,
      });

      res.status(500).json({
        success: false,
        message: "Error interno del servidor",
      });
    }
  };

  /**
   * Obtener una solicitud específica por ID
   */
  getRequestById = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;

      if (!id) {
        res.status(400).json({
          success: false,
          message: "ID de solicitud requerido",
        });
        return;
      }

      const request = await this.organizerRequestService.getRequestById(id);

      if (!request) {
        res.status(404).json({
          success: false,
          message: "Solicitud no encontrada",
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: request,
      });
    } catch (error: any) {
      logger.error("Error obteniendo solicitud de organizador", {
        error: error.message,
        requestId: req.params.id,
        ip: req.ip,
      });

      res.status(500).json({
        success: false,
        message: "Error interno del servidor",
      });
    }
  };

  /**
   * Obtener las solicitudes del usuario autenticado
   */
  getMyRequests = async (req: Request, res: Response): Promise<void> => {
    try {
      const user_id = req.user?.id;

      if (!user_id) {
        res.status(401).json({
          success: false,
          message: "Usuario no autenticado",
        });
        return;
      }

      const { status, page = 1, limit = 10 } = req.query;

      const requests = await this.organizerRequestService.getMyRequests(
        user_id,
        {
          status: status as string,
          page: Number(page),
          limit: Number(limit),
        }
      );

      logger.info("Solicitudes del usuario consultadas", {
        user_id,
        count: requests.data.length,
        total: requests.total,
        ip: req.ip,
      });

      res.status(200).json({
        success: true,
        data: requests,
      });
    } catch (error: any) {
      logger.error("Error obteniendo solicitudes del usuario", {
        error: error.message,
        user_id: req.user?.id,
        ip: req.ip,
      });

      res.status(500).json({
        success: false,
        message: "Error interno del servidor",
      });
    }
  };

  /**
   * Actualizar el estado de una solicitud (solo para administradores)
   */
  updateRequestStatus = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const { status, rejection_reason, notes } = req.body;

      if (!id) {
        res.status(400).json({
          success: false,
          message: "ID de solicitud requerido",
        });
        return;
      }

      const request = await this.organizerRequestService.updateRequestStatus(
        id,
        {
          status,
          rejection_reason,
          notes,
          reviewed_by: {
            id: req.user?.id || "system",
            name: (req.user as any)?.name || "Sistema",
          },
        }
      );

      if (!request) {
        res.status(404).json({
          success: false,
          message: "Solicitud no encontrada",
        });
        return;
      }

      logger.info("Estado de solicitud de organizador actualizado", {
        requestId: id,
        newStatus: status,
        reviewedBy: req.user?.id,
        ip: req.ip,
      });

      res.status(200).json({
        success: true,
        message: "Estado actualizado correctamente",
        data: request,
      });
    } catch (error: any) {
      logger.error("Error actualizando estado de solicitud", {
        error: error.message,
        requestId: req.params.id,
        ip: req.ip,
      });

      res.status(500).json({
        success: false,
        message: "Error interno del servidor",
      });
    }
  };
}
