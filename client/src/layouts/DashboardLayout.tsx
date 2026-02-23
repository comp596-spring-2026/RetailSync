import {
  AppBar,
  Box,
  Button,
  CssBaseline,
  Divider,
  Drawer,
  ListItemIcon,
  List,
  ListItemButton,
  ListItemText,
  Menu,
  MenuItem,
  Stack,
  Toolbar,
  Typography
} from '@mui/material';
import DashboardIcon from '@mui/icons-material/Dashboard';
import PointOfSaleIcon from '@mui/icons-material/PointOfSale';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import SyncAltIcon from '@mui/icons-material/SyncAlt';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import AssessmentIcon from '@mui/icons-material/Assessment';
import GroupIcon from '@mui/icons-material/Group';
import AdminPanelSettingsIcon from '@mui/icons-material/AdminPanelSettings';
import TuneIcon from '@mui/icons-material/Tune';
import LogoutIcon from '@mui/icons-material/Logout';
import ScienceOutlinedIcon from '@mui/icons-material/ScienceOutlined';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import SettingsOutlinedIcon from '@mui/icons-material/SettingsOutlined';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '../app/hooks';
import { authApi } from '../api/authApi';
import { clearCompany } from '../features/company/companySlice';
import { logout } from '../features/auth/authSlice';
import { hasPermission } from '../utils/permissions';
import { BrandLogo } from '../components/BrandLogo';
import { useMemo, useState } from 'react';

const drawerWidth = 260;

type NavItem = {
  label: string;
  path: string;
  icon: JSX.Element;
};

export const DashboardLayout = () => {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const location = useLocation();
  const permissions = useAppSelector((state) => state.auth.permissions);
  const user = useAppSelector((state) => state.auth.user);
  const role = useAppSelector((state) => state.auth.role);
  const company = useAppSelector((state) => state.company.company);
  const [profileAnchorEl, setProfileAnchorEl] = useState<null | HTMLElement>(null);
  const profileMenuOpen = Boolean(profileAnchorEl);

  const timezone = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone, []);
  const userDisplayName = user ? `${user.firstName} ${user.lastName}` : 'User';

  const onLogout = async () => {
    try {
      await authApi.logout();
    } finally {
      dispatch(logout());
      dispatch(clearCompany());
      navigate('/login', { replace: true });
    }
  };

  const onOpenProfileMenu = (event: React.MouseEvent<HTMLElement>) => {
    setProfileAnchorEl(event.currentTarget);
  };

  const onCloseProfileMenu = () => {
    setProfileAnchorEl(null);
  };

  const renderNavLink = (item: NavItem) => {
    return (
      <ListItemButton
        key={item.path}
        component={Link}
        to={item.path}
        selected={location.pathname === item.path}
        sx={{ borderRadius: 2, mb: 0.5 }}
      >
        <ListItemIcon sx={{ minWidth: 36 }}>{item.icon}</ListItemIcon>
        <ListItemText primary={item.label} />
      </ListItemButton>
    );
  };

  const coreLinks: NavItem[] = [
    ...(hasPermission(permissions, 'dashboard', 'view')
      ? [{ label: 'Dashboard', path: '/dashboard', icon: <DashboardIcon fontSize="small" /> }]
      : []),
    ...(hasPermission(permissions, 'pos', 'view')
      ? [{ label: 'POS', path: '/dashboard/pos', icon: <PointOfSaleIcon fontSize="small" /> }]
      : []),
    ...(hasPermission(permissions, 'reports', 'view')
      ? [{ label: 'Reports', path: '/dashboard/reports', icon: <AssessmentIcon fontSize="small" /> }]
      : []),
    ...(hasPermission(permissions, 'dashboard', 'view')
      ? [{ label: 'Playground', path: '/dashboard/playground', icon: <ScienceOutlinedIcon fontSize="small" /> }]
      : []),
    { label: 'Settings', path: '/dashboard/settings', icon: <SettingsOutlinedIcon fontSize="small" /> }
  ];

  const hubLinks: NavItem[] = [
    ...(hasPermission(permissions, 'items', 'view') ||
    hasPermission(permissions, 'inventory', 'view') ||
    hasPermission(permissions, 'locations', 'view')
      ? [{ label: 'Operations', path: '/dashboard/operations', icon: <TuneIcon fontSize="small" /> }]
      : []),
    ...(hasPermission(permissions, 'invoices', 'view') || hasPermission(permissions, 'suppliers', 'view')
      ? [{ label: 'Procurement', path: '/dashboard/procurement', icon: <ReceiptLongIcon fontSize="small" /> }]
      : []),
    ...(hasPermission(permissions, 'users', 'view') || hasPermission(permissions, 'rolesSettings', 'view')
      ? [{ label: 'Access', path: '/dashboard/access', icon: <AdminPanelSettingsIcon fontSize="small" /> }]
      : []),
    ...(hasPermission(permissions, 'reconciliation', 'view') || hasPermission(permissions, 'bankStatements', 'view')
      ? [{ label: 'Finance', path: '/dashboard/reconciliation', icon: <SyncAltIcon fontSize="small" /> }]
      : [])
  ];

  return (
    <Box sx={{ display: 'flex' }}>
      <CssBaseline />
      <AppBar
        position="fixed"
        color="default"
        sx={{
          zIndex: (theme) => theme.zIndex.drawer + 1,
          backgroundColor: '#ffffff',
          backgroundImage: 'none',
          color: '#0f172a',
          borderBottom: '1px solid #e2e8f0',
          boxShadow: '0 2px 10px rgba(15, 23, 42, 0.06)'
        }}
      >
        <Toolbar sx={{ display: 'flex', justifyContent: 'space-between' }}>
          <Stack direction="row" spacing={1.5} alignItems="center">
            <Box sx={{ px: 0, py: 0 }} component={Link} to="/dashboard" aria-label="Go to dashboard home">
              <BrandLogo variant="horizontal" height={80} />
            </Box>
            <Divider orientation="vertical" flexItem />
            <Typography variant="subtitle1" sx={{ fontWeight: 800, letterSpacing: 0.2, color: '#0f172a' }}>
              {company?.name ?? 'No Company'}
            </Typography>
          </Stack>
          <Stack direction="row" spacing={1.5} alignItems="center">
            <Divider orientation="vertical" flexItem />
            <Button
              color="inherit"
              onClick={onOpenProfileMenu}
              endIcon={<ExpandMoreIcon />}
              sx={{
                color: '#0f172a',
                textTransform: 'none',
                fontWeight: 700,
                px: 0.5,
                py: 0.5
              }}
            >
              {userDisplayName}
            </Button>
          </Stack>
        </Toolbar>
      </AppBar>
      <Menu
        anchorEl={profileAnchorEl}
        open={profileMenuOpen}
        onClose={onCloseProfileMenu}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        PaperProps={{
          sx: {
            minWidth: 300,
            borderRadius: 2,
            border: '1px solid #e2e8f0',
            boxShadow: '0 12px 30px rgba(15, 23, 42, 0.12)',
            mt: 0.5
          }
        }}
      >
        <Box sx={{ px: 2, py: 1.5 }}>
          <Typography variant="overline" color="text.secondary" sx={{ letterSpacing: 0.8 }}>
            Account Details
          </Typography>
          <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1.25 }}>
            {userDisplayName}
          </Typography>
          <Stack spacing={1}>
            <Stack direction="row" justifyContent="space-between" spacing={2}>
              <Typography variant="caption" color="text.secondary">
                Role
              </Typography>
              <Typography variant="caption" sx={{ fontWeight: 600 }}>
                {role?.name ?? 'Role not set'}
              </Typography>
            </Stack>
            <Stack direction="row" justifyContent="space-between" spacing={2}>
              <Typography variant="caption" color="text.secondary">
                Company
              </Typography>
              <Typography variant="caption" sx={{ fontWeight: 600, textAlign: 'right' }}>
                {company?.name ?? 'No Company'}
              </Typography>
            </Stack>
            <Stack direction="row" justifyContent="space-between" spacing={2}>
              <Typography variant="caption" color="text.secondary">
                Timezone
              </Typography>
              <Typography variant="caption" sx={{ fontWeight: 600, textAlign: 'right' }}>
                {timezone}
              </Typography>
            </Stack>
          </Stack>
        </Box>
        <Divider />
        <MenuItem component={Link} to="/dashboard/settings" onClick={onCloseProfileMenu}>
          <ListItemIcon>
            <SettingsOutlinedIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Settings</ListItemText>
        </MenuItem>
        <Divider />
        <MenuItem
          onClick={() => {
            onCloseProfileMenu();
            void onLogout();
          }}
        >
          <ListItemIcon>
            <LogoutIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Logout</ListItemText>
        </MenuItem>
      </Menu>
      <Drawer
        variant="permanent"
        sx={{
          width: drawerWidth,
          flexShrink: 0,
          [`& .MuiDrawer-paper`]: { width: drawerWidth, boxSizing: 'border-box' }
        }}
      >
        <Toolbar />
        <Box sx={{ overflow: 'auto', p: 1.5 }}>
          <List>
            {coreLinks.length > 0 && (
              <Box sx={{ mb: 1 }}>
                <Typography
                  variant="overline"
                  color="text.secondary"
                  sx={{ display: 'block', px: 1.5, pb: 0.5, lineHeight: 1.8 }}
                >
                  Core
                </Typography>
                {coreLinks.map(renderNavLink)}
                <Divider sx={{ my: 0.5 }} />
              </Box>
            )}
            {hubLinks.length > 0 && (
              <Box sx={{ mt: 0.5 }}>
                <Typography
                  variant="overline"
                  color="text.secondary"
                  sx={{ display: 'block', px: 1.5, pb: 0.5, lineHeight: 1.8 }}
                >
                  Workspaces
                </Typography>
                {hubLinks.map(renderNavLink)}
              </Box>
            )}
          </List>
        </Box>
      </Drawer>
      <Box component="main" sx={{ flexGrow: 1, p: 3 }}>
        <Toolbar />
        <Outlet />
      </Box>
    </Box>
  );
};
