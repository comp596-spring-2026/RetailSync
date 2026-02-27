import { createAsyncThunk, createSlice, PayloadAction } from '@reduxjs/toolkit';
import { itemsApi } from '../../api';
import type { RootState } from '../../app/store';
import { showSnackbar } from '../ui/uiSlice';

export type Item = {
  _id: string;
  barcode: string;
  upc: string;
  modifier: string;
  description: string;
  department: string;
  price: number;
  sku: string;
};

type ItemsState = {
  items: Item[];
  loading: boolean;
  error: string | null;
  lastLoadedAt: string | null;
};

const initialState: ItemsState = {
  items: [],
  loading: false,
  error: null,
  lastLoadedAt: null
};

export const fetchItems = createAsyncThunk<Item[], void, { state: RootState }>(
  'items/fetchAll',
  async () => {
    const res = await itemsApi.list();
    return res.data.data as Item[];
  }
);

export const deleteItem = createAsyncThunk<void, string>(
  'items/delete',
  async (id, { dispatch }) => {
    await itemsApi.remove(id);
    dispatch(showSnackbar({ message: 'Item deleted', severity: 'success' }));
  }
);

export const importItems = createAsyncThunk<void, File>(
  'items/import',
  async (file, { dispatch }) => {
    await itemsApi.importCsv(file);
    dispatch(showSnackbar({ message: 'Items CSV imported', severity: 'success' }));
  }
);

export const createItemThunk = createAsyncThunk<void, Omit<Item, '_id' | 'barcode'>>(
  'items/create',
  async (payload, { dispatch }) => {
    await itemsApi.create(payload);
    dispatch(showSnackbar({ message: 'Item created', severity: 'success' }));
  }
);

const itemsSlice = createSlice({
  name: 'items',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchItems.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchItems.fulfilled, (state, action: PayloadAction<Item[]>) => {
        state.loading = false;
        state.items = action.payload;
        state.lastLoadedAt = new Date().toISOString();
      })
      .addCase(fetchItems.rejected, (state) => {
        state.loading = false;
        state.error = 'Failed to load items';
      })
      .addCase(deleteItem.fulfilled, (state, action) => {
        const id = action.meta.arg;
        state.items = state.items.filter((it) => it._id !== id);
      })
      .addCase(importItems.fulfilled, (state) => {
        // After import we expect a refetch from the UI.
      })
      .addCase(createItemThunk.fulfilled, () => {
        // After create we expect a refetch from the UI.
      });
  }
});

export const selectItems = (state: RootState) => state.items.items;
export const selectItemsLoading = (state: RootState) => state.items.loading;
export const selectItemsError = (state: RootState) => state.items.error;

export default itemsSlice.reducer;

