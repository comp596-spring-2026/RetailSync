import { api } from '../client';

export type LocationType = 'shelf' | 'fridge' | 'freezer' | 'backroom';

export type CreateLocationPayload = {
  code: string;
  type: LocationType;
  label: string;
};

export type UpdateLocationPayload = Partial<CreateLocationPayload>;

export class LocationsApi {
  list() {
    return api.get('/locations');
  }

  create(payload: CreateLocationPayload) {
    return api.post('/locations', payload);
  }

  update(id: string, payload: UpdateLocationPayload) {
    return api.put(`/locations/${id}`, payload);
  }

  remove(id: string) {
    return api.delete(`/locations/${id}`);
  }
}

export const locationsApi = new LocationsApi();
