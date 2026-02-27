// Inventory domain barrel: items + locations (including stock/movement)
export { ItemsApi, itemsApi } from './ItemsApi';
export type { CreateItemPayload, UpdateItemPayload } from './ItemsApi';

export { LocationsApi, locationsApi } from './LocationsApi';
export type {
  CreateLocationPayload,
  LocationType,
  UpdateLocationPayload,
  MovePayload
} from './LocationsApi';
