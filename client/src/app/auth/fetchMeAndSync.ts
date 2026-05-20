import type { AppDispatch } from '../store';
import { authApi } from '../api';
import { setAuthContext } from '../../modules/auth/state';
import { setCompany } from '../../modules/users/state';

export type MeData = {
  user: { _id: string; firstName: string; lastName: string; email: string; companyId: string | null; roleId: string | null };
  role: { _id: string; name: string; isSystem: boolean; permissions: Record<string, boolean> } | null;
  permissions: Record<string, boolean> | null;
  company: { _id: string; name: string; code: string; businessType: string; address: string; phone: string; email: string; timezone: string; currency: string } | null;
};

/**
 * Fetches /auth/me and syncs user, role, permissions and company into Redux.
 * Use after login or after create/join company so auth and company state stay in one place.
 */
export async function fetchMeAndSync(dispatch: AppDispatch): Promise<MeData> {
  const res = await authApi.me();
  const data = res.data.data as MeData;
  const normalizedPermissions = data.permissions ?? data.role?.permissions ?? null;
  dispatch(
    setAuthContext({
      user: data.user,
      role: data.role
        ? {
            ...data.role,
            permissions: normalizedPermissions ?? data.role.permissions
          }
        : null,
      permissions: normalizedPermissions
    })
  );
  dispatch(setCompany(data.company ?? null));
  return data;
}
