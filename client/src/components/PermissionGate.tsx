import { ModuleKey } from '@retailsync/shared';
import { ReactElement, cloneElement } from 'react';
import { useAppSelector } from '../app/store/hooks';
import { hasPermission } from '../shared/utils/permissions';

type PermissionGateProps = {
  module: ModuleKey;
  action: 'view' | 'create' | 'edit' | 'delete' | `actions:${string}`;
  mode?: 'hide' | 'disable';
  children: ReactElement;
};

export const PermissionGate = ({ module, action, mode = 'hide', children }: PermissionGateProps) => {
  const permissions = useAppSelector((state) => state.auth.permissions);
  const allowed = hasPermission(permissions, module, action);

  if (allowed) {
    return children;
  }

  if (mode === 'disable') {
    return cloneElement(children as ReactElement<{ disabled?: boolean }>, { disabled: true });
  }

  return null;
};
