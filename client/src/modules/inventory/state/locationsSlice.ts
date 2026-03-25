import { createAsyncThunk, createSlice, PayloadAction } from '@reduxjs/toolkit';
import { locationsApi } from '../api';
import type { RootState } from '../../../app/store';
import { showSnackbar } from '../../../app/store/uiSlice';

export type LocationItem = {
  _id: string;
  code: string;
  type: 'shelf' | 'fridge' | 'freezer' | 'backroom';
  label: string;
};

type LocationsState = {
  items: LocationItem[];
  loading: boolean;
  mutating: boolean;
  error: string | null;
};

const initialState: LocationsState = {
  items: [],
  loading: false,
  mutating: false,
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
    await dispatch(fetchLocations());
  }
);

export const updateLocationThunk = createAsyncThunk<void, { id: string; payload: Partial<Omit<LocationItem, '_id'>> }>(
  'locations/update',
  async ({ id, payload }, { dispatch }) => {
    await locationsApi.update(id, payload);
    dispatch(showSnackbar({ message: 'Location updated', severity: 'success' }));
    await dispatch(fetchLocations());
  }
);

export const deleteLocationThunk = createAsyncThunk<void, string>(
  'locations/delete',
  async (id, { dispatch }) => {
    await locationsApi.remove(id);
    dispatch(showSnackbar({ message: 'Location deleted', severity: 'success' }));
    await dispatch(fetchLocations());
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
      .addCase(createLocationThunk.pending, (state) => {
        state.mutating = true;
      })
      .addCase(createLocationThunk.fulfilled, (state) => {
        state.mutating = false;
      })
      .addCase(createLocationThunk.rejected, (state) => {
        state.mutating = false;
      })
      .addCase(updateLocationThunk.pending, (state) => {
        state.mutating = true;
      })
      .addCase(updateLocationThunk.fulfilled, (state) => {
        state.mutating = false;
      })
      .addCase(updateLocationThunk.rejected, (state) => {
        state.mutating = false;
      })
      .addCase(deleteLocationThunk.pending, (state) => {
        state.mutating = true;
      })
      .addCase(deleteLocationThunk.fulfilled, (state) => {
        state.mutating = false;
      })
      .addCase(deleteLocationThunk.rejected, (state) => {
        state.mutating = false;
      });
  }
});

export const selectLocations = (state: RootState) => state.locations.items;
export const selectLocationsLoading = (state: RootState) => state.locations.loading;
export const selectLocationsMutating = (state: RootState) => state.locations.mutating;
export const selectLocationsError = (state: RootState) => state.locations.error;

export default locationsSlice.reducer;
