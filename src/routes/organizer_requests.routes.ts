import { Router } from "express";
import { OrganizerRequestsController } from "../controllers/organizer_requests.controller";
import { authenticate_token as authMiddleware } from "../middleware/auth.middleware";

const router = Router();
const organizerRequestsController = new OrganizerRequestsController();

/**
 * @route POST /organizer-requests
 * @desc Crear una nueva solicitud de organizador
 * @access Public
 */
router.post("/", organizerRequestsController.createRequest);

/**
 * @route GET /organizer-requests/my-requests
 * @desc Obtener las solicitudes del usuario autenticado
 * @access Private (User)
 */
router.get(
  "/my-requests",
  authMiddleware,
  organizerRequestsController.getMyRequests
);

/**
 * @route GET /organizer-requests
 * @desc Obtener todas las solicitudes de organizadores
 * @access Private (Admin only)
 */
router.get("/", authMiddleware, organizerRequestsController.getAllRequests);

/**
 * @route GET /organizer-requests/:id
 * @desc Obtener una solicitud específica por ID
 * @access Private (Admin only)
 */
router.get("/:id", authMiddleware, organizerRequestsController.getRequestById);

/**
 * @route PATCH /organizer-requests/:id/status
 * @desc Actualizar el estado de una solicitud
 * @access Private (Admin only)
 */
router.patch(
  "/:id/status",
  authMiddleware,
  organizerRequestsController.updateRequestStatus
);

export { router as organizer_requests_routes };
