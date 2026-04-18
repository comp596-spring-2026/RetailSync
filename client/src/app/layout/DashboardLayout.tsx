import {
  AppBar,
  Box,
  Button,
  CssBaseline,
  Divider,
  Drawer,
  IconButton,
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
import { useTheme } from '@mui/material/styles';
import DashboardIcon from '@mui/icons-material/Dashboard';
import MenuIcon from '@mui/icons-material/Menu';
import PointOfSaleIcon from '@mui/icons-material/PointOfSale';
import AdminPanelSettingsIcon from '@mui/icons-material/AdminPanelSettings';
import LogoutIcon from '@mui/icons-material/Logout';
import ScienceOutlinedIcon from '@mui/icons-material/ScienceOutlined';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import SettingsOutlinedIcon from '@mui/icons-material/SettingsOutlined';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import CalculateOutlinedIcon from '@mui/icons-material/CalculateOutlined';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { logoutThunk } from '../../modules/auth/state';
import { hasPermission } from '../../utils/permissions';
import { LogoHorizontal } from '../../components';
import { useMemo, useState } from 'react';
import useMediaQuery from '@mui/material/useMediaQuery';

const drawerWidth = 260;

type NavItem = {
  label: string;
  path: string;
  icon: JSX.Element;
  matchPrefix?: string;
};

export const DashboardLayout = () => {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const location = useLocation();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const permissions = useAppSelector((state) => state.auth.permissions);
  const user = useAppSelector((state) => state.auth.user);
  const role = useAppSelector((state) => state.auth.role);
  const company = useAppSelector((state) => state.company.company);
  const [profileAnchorEl, setProfileAnchorEl] = useState<null | HTMLElement>(null);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const profileMenuOpen = Boolean(profileAnchorEl);

  const timezone = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone, []);
  const isDevelopment = import.meta.env.DEV;
  const userDisplayName = user ? `${user.firstName} ${user.lastName}` : 'User';
  const canViewAccountingStatements = hasPermission(permissions, 'bankStatements', 'view');
  const canViewQuickbooksHome = hasPermission(permissions, 'quickbooks', 'view');
  const canViewAccounting = canViewAccountingStatements;
  const closeMobileDrawer = () => setMobileDrawerOpen(false);

  const onLogout = async () => {
    await dispatch(logoutThunk()).unwrap();
    navigate('/dashboard', { replace: true });
  };

  const onOpenProfileMenu = (event: React.MouseEvent<HTMLElement>) => {
    setProfileAnchorEl(event.currentTarget);
  };

  const onCloseProfileMenu = () => {
    setProfileAnchorEl(null);
  };

  const renderNavLink = (item: NavItem) => {
    const isSelected = item.matchPrefix
      ? location.pathname === item.matchPrefix || location.pathname.startsWith(`${item.matchPrefix}/`)
      : item.path === '/dashboard'
        ? location.pathname === item.path
        : location.pathname === item.path || location.pathname.startsWith(`${item.path}/`);

    return (
      <ListItemButton
        key={item.path}
        component={Link}
        to={item.path}
        selected={isSelected}
        onClick={closeMobileDrawer}
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
    ...(canViewAccounting
      ? [{
          label: 'Accounting',
          path: '/dashboard/accounting',
          matchPrefix: '/dashboard/accounting',
          icon: <AccountBalanceIcon fontSize="small" />
        }]
      : []),
    ...(canViewQuickbooksHome
      ? [{
          label: 'QuickBooks',
          path: '/dashboard/quickbooks',
          matchPrefix: '/dashboard/quickbooks',
          icon: <CalculateOutlinedIcon fontSize="small" />
        }]
      : []),
    { label: 'Settings', path: '/dashboard/settings', icon: <SettingsOutlinedIcon fontSize="small" /> }
  ];

  const hubLinks: NavItem[] = [
    ...(hasPermission(permissions, 'users', 'view') || hasPermission(permissions, 'rolesSettings', 'view')
      ? [{ label: 'Access', path: '/dashboard/access/users', matchPrefix: '/dashboard/access', icon: <AdminPanelSettingsIcon fontSize="small" /> }]
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
        <Toolbar sx={{ display: 'flex', justifyContent: 'space-between', gap: 1, minHeight: { xs: 64, md: 72 } }}>
          <Stack direction="row" spacing={1.25} alignItems="center" sx={{ minWidth: 0, flex: 1 }}>
            <IconButton
              aria-label="Open navigation"
              edge="start"
              onClick={() => setMobileDrawerOpen(true)}
              sx={{ display: { xs: 'inline-flex', md: 'none' } }}
            >
              <MenuIcon />
            </IconButton>
            <Box sx={{ display: { xs: 'none', md: 'block' } }} component={Link} to="/dashboard" aria-label="Go to dashboard home">
              <LogoHorizontal height={isMobile ? 56 : 80} />
            </Box>
            <Box sx={{ minWidth: 0, display: 'flex', alignItems: 'center', gap: 1.25 }}>
              <Box sx={{ display: { xs: 'block', md: 'none' } }}>
                <LogoHorizontal height={44} />
              </Box>
              <Divider orientation="vertical" flexItem sx={{ display: { xs: 'none', md: 'block' } }} />
              <Typography
                variant="subtitle1"
                noWrap
                sx={{
                  minWidth: 0,
                  maxWidth: { xs: 140, sm: 220, md: 280 },
                  fontWeight: 800,
                  letterSpacing: 0.2,
                  color: '#0f172a',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis'
                }}
              >
                {company?.name ?? 'No Company'}
              </Typography>
            </Box>
          </Stack>
          <Stack direction="row" spacing={1.5} alignItems="center" sx={{ flexShrink: 0 }}>
            <Button
              color="inherit"
              onClick={onOpenProfileMenu}
              endIcon={<ExpandMoreIcon />}
              sx={{
                color: '#0f172a',
                textTransform: 'none',
                fontWeight: 700,
                px: 0.5,
                py: 0.5,
                maxWidth: { xs: 140, sm: 220 },
                overflow: 'hidden'
              }}
            >
              <Box component="span" sx={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {userDisplayName}
              </Box>
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
        {isDevelopment && hasPermission(permissions, 'dashboard', 'view') ? (
          <MenuItem component={Link} to="/dashboard/playground" onClick={onCloseProfileMenu}>
            <ListItemIcon>
              <ScienceOutlinedIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText>Playground</ListItemText>
          </MenuItem>
        ) : null}
        {isDevelopment && hasPermission(permissions, 'dashboard', 'view') ? <Divider /> : null}
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
      <Box component="nav" sx={{ width: { md: drawerWidth }, flexShrink: { md: 0 } }}>
        <Drawer
          variant="temporary"
          open={mobileDrawerOpen}
          onClose={closeMobileDrawer}
          ModalProps={{ keepMounted: true }}
          sx={{
            display: { xs: 'block', md: 'none' },
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
        <Drawer
          variant="permanent"
          sx={{
            display: { xs: 'none', md: 'block' },
            width: drawerWidth,
            flexShrink: 0,
            [`& .MuiDrawer-paper`]: { width: drawerWidth, boxSizing: 'border-box' }
          }}
          open
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
      </Box>
      <Box component="main" sx={{ flexGrow: 1, p: { xs: 2, md: 3 }, minWidth: 0 }}>
        <Toolbar />
        <Outlet />
      </Box>
    </Box>
  );
};
