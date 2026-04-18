import type { NavigateFunction } from 'react-router-dom';
import { fetchMeAndSync } from '../../../app/auth/fetchMeAndSync';
import type { AppDispatch } from '../../../app/store';
import { setAccessToken } from '../state';
import { readRegistrationCompanyDraft } from './registrationDraft';

export const finalizeAuthSession = async (dispatch: AppDispatch, navigate: NavigateFunction, accessToken: string) => {
  dispatch(setAccessToken(accessToken));
  const meData = await fetchMeAndSync(dispatch);
  navigate(meData.company ? '/dashboard' : readRegistrationCompanyDraft() ? '/onboarding/create-company' : '/onboarding', { replace: true });
  return meData;
};
