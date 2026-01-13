import { Router } from "express";
import { auth_controller } from "../controllers/auth.controller";
import { authenticate_token } from "../middleware/auth.middleware";

const router = Router();

// Rutas públicas
router.post("/login", auth_controller.login.bind(auth_controller));
router.post("/refresh", auth_controller.refresh.bind(auth_controller));
router.post("/logout", auth_controller.logout.bind(auth_controller));
router.get(
  "/check-handle/:handle",
  auth_controller.check_handle.bind(auth_controller)
);

// Rutas protegidas
router.get(
  "/me",
  authenticate_token,
  auth_controller.get_me.bind(auth_controller)
);
router.patch(
  "/profile",
  authenticate_token,
  auth_controller.update_profile.bind(auth_controller)
);

export { router as auth_routes };
