import type { Request, Response } from "express";
import { canchas_service } from "../services/canchas.services";

export class CanchasController {
  async get_canchas(req: Request, res: Response): Promise<void> {
    try {
      const canchas = await canchas_service.get_canchas();
      res.status(200).json(canchas);
    } catch (error) {
      res.status(500).json({ message: "Error al obtener las canchas" });
    }
  }
}
