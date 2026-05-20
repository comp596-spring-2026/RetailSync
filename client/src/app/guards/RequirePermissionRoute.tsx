import { ModuleKey } from '@retailsync/shared';
import { Navigate, Outlet } from 'react-router-dom';
import { NoAccess } from '../../components';
import { useAppSelector } from '../store/hooks';
import { hasPermission } from '../../utils/permissions';

type RequirePermissionRouteProps = {
  module: ModuleKey;
  action: 'view' | 'create' | 'edit' | 'delete' | `actions:${string}`;
  redirectTo?: string;
};

export const RequirePermissionRoute = ({
  module,
  action,
  redirectTo
}: RequirePermissionRouteProps) => {
  const permissions = useAppSelector((state) => state.auth.permissions);

  if (!hasPermission(permissions, module, action)) {
    if (redirectTo) {
      return <Navigate to={redirectTo} replace />;
    }
    return <NoAccess />;
  }

  return <Outlet />;
};
