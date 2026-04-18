import AdminPanelSettingsIcon from '@mui/icons-material/AdminPanelSettings';
import { Paper, Tab, Tabs } from '@mui/material';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { useAppSelector } from '../../../app/store/hooks';
import { PageHeader } from '../../../components';
import { hasPermission } from '../../../utils/permissions';

type AccessTab = 'users' | 'roles';

export const AccessHubPage = () => {
  const location = useLocation();
  const permissions = useAppSelector((state) => state.auth.permissions);
  const tab = location.pathname.endsWith('/roles')
    ? 'roles'
    : 'users';
  const tabItems = [
    hasPermission(permissions, 'users', 'view') ? { value: 'users' as const, label: 'Users', to: 'users' } : null,
    hasPermission(permissions, 'rolesSettings', 'view')
      ? { value: 'roles' as const, label: 'Roles', to: 'roles' }
      : null
  ].filter((item): item is { value: AccessTab; label: string; to: string } => Boolean(item));
  const activeTab = tabItems.some((item) => item.value === tab) ? tab : tabItems[0]?.value ?? false;

  return (
    <>
      <PageHeader
        title="Access"
        subtitle="Manage users, roles, and access settings in one workspace"
        icon={<AdminPanelSettingsIcon />}
      />
      <Paper sx={{ mt: 2, px: 1, py: 0.5 }}>
        <Tabs value={activeTab} variant="scrollable" allowScrollButtonsMobile aria-label="Access workspace tabs">
          {tabItems.map((item) => (
            <Tab key={item.value} component={Link} to={item.to} value={item.value} label={item.label} />
          ))}
        </Tabs>
      </Paper>
      <Outlet />
    </>
  );
};
