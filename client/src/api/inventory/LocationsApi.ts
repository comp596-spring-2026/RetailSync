import { api } from '../client';

export type LocationType = 'shelf' | 'fridge' | 'freezer' | 'backroom';

export type CreateLocationPayload = {
  code: string;
  type: LocationType;
  label: string;
};

export type UpdateLocationPayload = Partial<CreateLocationPayload>;

export type MovePayload = {
  itemId: string;
  fromLocationCode: string;
  toLocationCode: string;
  qty: number;
  notes?: string;
};

export class LocationsApi {
  list() {
    return api.get('/inventory/locations');
  }

  create(payload: CreateLocationPayload) {
    return api.post('/inventory/locations', payload);
  }

  update(id: string, payload: UpdateLocationPayload) {
    return api.put(`/inventory/locations/${id}`, payload);
  }

  remove(id: string) {
    return api.delete(`/inventory/locations/${id}`);
  }

  byLocation(code: string) {
    return api.get(`/inventory/location/${encodeURIComponent(code)}`);
  }

  move(payload: MovePayload) {
    return api.post('/inventory/move', payload);
  }
}

export const locationsApi = new LocationsApi();

