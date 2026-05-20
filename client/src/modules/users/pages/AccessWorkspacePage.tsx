import AdminPanelSettingsIcon from '@mui/icons-material/AdminPanelSettings';
import { Box, Paper, ToggleButton, ToggleButtonGroup } from '@mui/material';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { useAppSelector } from '../../../app/store/hooks';
import { PageHeader } from '../../../components';
import { hasProductCapability } from '../../../utils/productPermissions';

type AccessTab = 'users' | 'roles';

export const AccessWorkspacePage = () => {
  const location = useLocation();
  const permissions = useAppSelector((state) => state.auth.permissions);
  const tab = location.pathname.endsWith('/roles') ? 'roles' : 'users';
  const tabItems = [
    hasProductCapability(permissions, 'access.users.view') ||
    hasProductCapability(permissions, 'access.users.invite') ||
    hasProductCapability(permissions, 'access.users.assignRoles') ||
    hasProductCapability(permissions, 'access.users.deactivate')
      ? { value: 'users' as const, label: 'Users', to: 'users' }
      : null,
    hasProductCapability(permissions, 'access.roles.view') ||
    hasProductCapability(permissions, 'access.roles.create') ||
    hasProductCapability(permissions, 'access.roles.edit') ||
    hasProductCapability(permissions, 'access.roles.delete')
      ? { value: 'roles' as const, label: 'Roles', to: 'roles' }
      : null
  ].filter((item): item is { value: AccessTab; label: string; to: string } => Boolean(item));
  const activeTab = tabItems.some((item) => item.value === tab) ? tab : tabItems[0]?.value;

  return (
    <>
      <PageHeader
        title="Access"
        subtitle="Manage team members, roles, and permissions"
        icon={<AdminPanelSettingsIcon />}
      />

      {tabItems.length > 0 ? (
        <Paper
          elevation={0}
          data-testid="access-tab-switch"
          sx={{
            mt: 2,
            borderRadius: 2,
            border: '1px solid',
            borderColor: 'divider',
            backgroundColor: 'background.paper',
            p: 0.75
          }}
        >
          <ToggleButtonGroup
            exclusive
            fullWidth
            value={activeTab ?? false}
            aria-label="Access workspace switch"
            sx={{
              gap: 0.75,
              '& .MuiToggleButtonGroup-grouped': {
                flex: 1,
                border: 0,
                borderRadius: '8px !important',
                mx: 0,
                textTransform: 'uppercase',
                fontWeight: 700,
                fontSize: '0.8rem',
                letterSpacing: '0.06em',
                py: 1.25,
                color: 'text.secondary',
                '&:not(:first-of-type)': {
                  borderRadius: '8px !important',
                  borderLeft: 0
                },
                '&.Mui-selected': {
                  color: 'primary.main',
                  backgroundColor: 'transparent',
                  boxShadow: (theme) => `inset 0 -3px 0 ${theme.palette.primary.main}`,
                  '&:hover': {
                    backgroundColor: 'transparent'
                  }
                },
                '&.Mui-disabled': {
                  opacity: 0.5
                }
              }
            }}
          >
            {tabItems.map((item) => (
              <ToggleButton
                key={item.value}
                component={Link}
                to={item.to}
                value={item.value}
                data-testid={`access-tab-${item.value}`}
              >
                {item.label}
              </ToggleButton>
            ))}
          </ToggleButtonGroup>
        </Paper>
      ) : null}

      <Box sx={{ mt: 2 }}>
        <Outlet />
      </Box>
    </>
  );
};
