import { createAsyncThunk, createSlice, PayloadAction } from '@reduxjs/toolkit';
import { locationsApi } from '../../api';
import type { RootState } from '../../app/store';
import { showSnackbar } from '../ui/uiSlice';

export type LocationItem = {
  _id: string;
  code: string;
  type: 'shelf' | 'fridge' | 'freezer' | 'backroom';
  label: string;
};

type LocationsState = {
  items: LocationItem[];
  loading: boolean;
  error: string | null;
};

const initialState: LocationsState = {
  items: [],
  loading: false,
  error: null
};

export const fetchLocations = createAsyncThunk<LocationItem[]>(
  'locations/fetchAll',
  async () => {
    const res = await locationsApi.list();
    return res.data.data as LocationItem[];
  }
);

export const createLocationThunk = createAsyncThunk<void, Omit<LocationItem, '_id'>>(
  'locations/create',
  async (payload, { dispatch }) => {
    await locationsApi.create(payload);
    dispatch(showSnackbar({ message: 'Location created', severity: 'success' }));
  }
);

const locationsSlice = createSlice({
  name: 'locations',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchLocations.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchLocations.fulfilled, (state, action: PayloadAction<LocationItem[]>) => {
        state.loading = false;
        state.items = action.payload;
      })
      .addCase(fetchLocations.rejected, (state) => {
        state.loading = false;
        state.error = 'Failed to load locations';
      })
      .addCase(createLocationThunk.fulfilled, () => {
        // UI should refetch or optimistically update
      });
  }
});

export const selectLocations = (state: RootState) => state.locations.items;
export const selectLocationsLoading = (state: RootState) => state.locations.loading;
export const selectLocationsError = (state: RootState) => state.locations.error;

export default locationsSlice.reducer;

