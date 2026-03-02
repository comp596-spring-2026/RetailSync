import { configureStore } from '@reduxjs/toolkit';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import locationsReducer, { fetchLocations } from '../state/locationsSlice';
import uiReducer from '../../../app/store/uiSlice';

const mockedLocationsApi = vi.hoisted(() => ({
  list: vi.fn(),
  create: vi.fn()
}));

vi.mock('../api', () => ({
  locationsApi: mockedLocationsApi
}));

describe('locationsSlice', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('stores locations when fetchLocations succeeds', async () => {
    mockedLocationsApi.list.mockResolvedValueOnce({
      data: {
        data: [
          {
            _id: 'loc-1',
            code: 'A1',
            type: 'shelf',
            label: 'Shelf A1'
          }
        ]
      }
    });

    const store = configureStore({
      reducer: {
        locations: locationsReducer,
        ui: uiReducer
      }
    });

    await store.dispatch(fetchLocations());
    const state = store.getState().locations;

    expect(state.items).toHaveLength(1);
    expect(state.items[0]?.code).toBe('A1');
    expect(state.loading).toBe(false);
  });

  it('stores error message when fetchLocations fails', async () => {
    mockedLocationsApi.list.mockRejectedValueOnce(new Error('boom'));

    const store = configureStore({
      reducer: {
        locations: locationsReducer,
        ui: uiReducer
      }
    });

    await store.dispatch(fetchLocations());
    const state = store.getState().locations;

    expect(state.items).toHaveLength(0);
    expect(state.error).toBe('Failed to load locations');
  });
});
