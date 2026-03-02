import { configureStore } from '@reduxjs/toolkit';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import itemsReducer, { deleteItem, fetchItems } from '../state/itemsSlice';
import uiReducer from '../../../app/store/uiSlice';

const mockedItemsApi = vi.hoisted(() => ({
  list: vi.fn(),
  remove: vi.fn(),
  importCsv: vi.fn(),
  create: vi.fn()
}));

vi.mock('../api', () => ({
  itemsApi: mockedItemsApi
}));

describe('itemsSlice', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('stores item list from fetchItems', async () => {
    mockedItemsApi.list.mockResolvedValueOnce({
      data: {
        data: [
          {
            _id: 'item-1',
            barcode: '123',
            upc: '123',
            modifier: '',
            description: 'Chocolate Bar',
            department: 'snacks',
            price: 2.5,
            sku: 'SKU-123'
          }
        ]
      }
    });

    const store = configureStore({
      reducer: {
        items: itemsReducer,
        ui: uiReducer
      }
    });

    await (store.dispatch as unknown as (action: unknown) => Promise<unknown>)(fetchItems());
    const state = store.getState().items;

    expect(state.items).toHaveLength(1);
    expect(state.items[0]?.description).toBe('Chocolate Bar');
    expect(state.lastLoadedAt).not.toBeNull();
  });

  it('removes row from local cache after deleteItem', async () => {
    mockedItemsApi.list.mockResolvedValueOnce({
      data: {
        data: [
          {
            _id: 'item-1',
            barcode: '123',
            upc: '123',
            modifier: '',
            description: 'Chocolate Bar',
            department: 'snacks',
            price: 2.5,
            sku: 'SKU-123'
          }
        ]
      }
    });
    mockedItemsApi.remove.mockResolvedValueOnce({ data: { status: 'ok' } });

    const store = configureStore({
      reducer: {
        items: itemsReducer,
        ui: uiReducer
      }
    });

    await (store.dispatch as unknown as (action: unknown) => Promise<unknown>)(fetchItems());
    await (store.dispatch as unknown as (action: unknown) => Promise<unknown>)(deleteItem('item-1'));

    expect(store.getState().items.items).toHaveLength(0);
    expect(mockedItemsApi.remove).toHaveBeenCalledWith('item-1');
  });
});
