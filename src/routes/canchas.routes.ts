import { Router } from "express";
import { CanchasController } from "../controllers/canchas.controller";

const router = Router();

const canchas_controller = new CanchasController();

router.get("/canchas", canchas_controller.get_canchas.bind(canchas_controller));

export { router as canchas_routes };
