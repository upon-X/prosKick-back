import { Cancha, type ICancha } from "../models/canchas.model";

class CanchasService {
  async get_canchas(): Promise<ICancha[]> {
    const canchas = await Cancha.find();
    return canchas;
  }
}

export const canchas_service = new CanchasService();