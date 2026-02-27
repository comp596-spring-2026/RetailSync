import { api } from '../client';

export type MovePayload = {
  itemId: string;
  fromLocationCode: string;
  toLocationCode: string;
  qty: number;
  notes?: string;
};

export class InventoryApi {
  move(payload: MovePayload) {
    return api.post('/inventory/move', payload);
  }

  byLocation(code: string) {
    return api.get(`/inventory/location/${encodeURIComponent(code)}`);
  }
}

export const inventoryApi = new InventoryApi();
