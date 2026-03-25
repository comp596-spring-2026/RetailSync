import { createAsyncThunk, createSlice, PayloadAction } from '@reduxjs/toolkit';
import { fetchMeAndSync } from '../../../app/auth/fetchMeAndSync';
import { showSnackbar } from '../../../app/store/uiSlice';
import { companyApi, type CreateCompanyPayload, type JoinCompanyPayload } from '../api';

type Company = {
  _id: string;
  name: string;
  code: string;
  businessType: string;
  address: string;
  phone: string;
  email: string;
  timezone: string;
  currency: string;
};

type CompanyState = {
  company: Company | null;
  saving: boolean;
};

const initialState: CompanyState = {
  company: null,
  saving: false
};

export const createCompanyThunk = createAsyncThunk<void, CreateCompanyPayload>(
  'company/create',
  async (payload, { dispatch }) => {
    await companyApi.create(payload);
    await fetchMeAndSync(dispatch);
    dispatch(showSnackbar({ message: 'Company created', severity: 'success' }));
  }
);

export const joinCompanyThunk = createAsyncThunk<void, JoinCompanyPayload>(
  'company/join',
  async (payload, { dispatch }) => {
    await companyApi.join(payload);
    await fetchMeAndSync(dispatch);
    dispatch(showSnackbar({ message: 'Joined company', severity: 'success' }));
  }
);

const companySlice = createSlice({
  name: 'company',
  initialState,
  reducers: {
    setCompany(state, action: PayloadAction<Company | null>) {
      state.company = action.payload;
    },
    clearCompany(state) {
      state.company = null;
    }
  },
  extraReducers: (builder) => {
    builder
      .addCase(createCompanyThunk.pending, (state) => {
        state.saving = true;
      })
      .addCase(createCompanyThunk.fulfilled, (state) => {
        state.saving = false;
      })
      .addCase(createCompanyThunk.rejected, (state) => {
        state.saving = false;
      })
      .addCase(joinCompanyThunk.pending, (state) => {
        state.saving = true;
      })
      .addCase(joinCompanyThunk.fulfilled, (state) => {
        state.saving = false;
      })
      .addCase(joinCompanyThunk.rejected, (state) => {
        state.saving = false;
      });
  }
});

export const { setCompany, clearCompany } = companySlice.actions;
export const selectCompanySaving = (state: { company: CompanyState }) => state.company.saving;
export default companySlice.reducer;
