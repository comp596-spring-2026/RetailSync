import { createSlice, PayloadAction } from '@reduxjs/toolkit';

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
};

const initialState: CompanyState = {
  company: null
};

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
  }
});

export const { setCompany, clearCompany } = companySlice.actions;
export default companySlice.reducer;
