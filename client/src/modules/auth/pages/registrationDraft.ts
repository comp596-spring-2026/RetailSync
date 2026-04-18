export type RegistrationCompanyDraft = {
  name: string;
  businessType: string;
  address: string;
  phone: string;
  email: string;
  timezone: string;
  currency: string;
};

const registrationDraftKey = 'retailsync.registration.companyDraft';

const canUseStorage = () => typeof window !== 'undefined' && typeof window.sessionStorage !== 'undefined';

export const saveRegistrationCompanyDraft = (draft: RegistrationCompanyDraft) => {
  if (!canUseStorage()) return;
  window.sessionStorage.setItem(registrationDraftKey, JSON.stringify(draft));
};

export const readRegistrationCompanyDraft = (): RegistrationCompanyDraft | null => {
  if (!canUseStorage()) return null;

  const raw = window.sessionStorage.getItem(registrationDraftKey);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as RegistrationCompanyDraft;
  } catch {
    window.sessionStorage.removeItem(registrationDraftKey);
    return null;
  }
};

export const clearRegistrationCompanyDraft = () => {
  if (!canUseStorage()) return;
  window.sessionStorage.removeItem(registrationDraftKey);
};
