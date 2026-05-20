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
  Tooltip,
  Typography
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import DashboardIcon from '@mui/icons-material/Dashboard';
import MenuIcon from '@mui/icons-material/Menu';
import MenuOpenIcon from '@mui/icons-material/MenuOpen';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
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
import { canShowAccess, canShowAccounting, canShowDashboard, canShowPos, canShowQuickbooks, canShowSettings } from '../../utils/productPermissions';
import { LogoHorizontal } from '../../components';
import { useEffect, useMemo, useState } from 'react';
import useMediaQuery from '@mui/material/useMediaQuery';

const drawerWidth = 260;
const drawerCollapsedWidth = 72;
const DESKTOP_NAV_COLLAPSED_KEY = 'app.dashboard.navCollapsed';

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
  const [desktopNavCollapsed, setDesktopNavCollapsed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem(DESKTOP_NAV_COLLAPSED_KEY) === '1';
  });
  const profileMenuOpen = Boolean(profileAnchorEl);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(DESKTOP_NAV_COLLAPSED_KEY, desktopNavCollapsed ? '1' : '0');
  }, [desktopNavCollapsed]);

  const desktopDrawerWidth = desktopNavCollapsed ? drawerCollapsedWidth : drawerWidth;

  const timezone = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone, []);
  const isDevelopment = import.meta.env.DEV;
  const userDisplayName = user ? `${user.firstName} ${user.lastName}` : 'User';
  const canViewAccounting = canShowAccounting(permissions);
  const canViewQuickbooksHome = canShowQuickbooks(permissions);
  const canViewSettings = canShowSettings(permissions);
  const isAuthenticated = Boolean(user);
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

  const renderNavLink = (item: NavItem, options?: { collapsed?: boolean }) => {
    const collapsed = Boolean(options?.collapsed);
    const isSelected = item.matchPrefix
      ? location.pathname === item.matchPrefix || location.pathname.startsWith(`${item.matchPrefix}/`)
      : item.path === '/dashboard'
        ? location.pathname === item.path
        : location.pathname === item.path || location.pathname.startsWith(`${item.path}/`);

    const button = (
      <ListItemButton
        key={item.path}
        component={Link}
        to={item.path}
        selected={isSelected}
        onClick={closeMobileDrawer}
        sx={{
          borderRadius: 2,
          mb: 0.5,
          minHeight: 44,
          justifyContent: collapsed ? 'center' : 'flex-start',
          px: collapsed ? 1 : 2
        }}
      >
        <ListItemIcon sx={{ minWidth: collapsed ? 0 : 36, justifyContent: 'center', mr: collapsed ? 0 : 1 }}>
          {item.icon}
        </ListItemIcon>
        {collapsed ? null : <ListItemText primary={item.label} />}
      </ListItemButton>
    );

    if (collapsed) {
      return (
        <Tooltip key={item.path} title={item.label} placement="right" arrow>
          {button}
        </Tooltip>
      );
    }
    return button;
  };

  const coreLinks: NavItem[] = [
    ...(canShowDashboard(permissions)
      ? [{ label: 'Dashboard', path: '/dashboard', icon: <DashboardIcon fontSize="small" /> }]
      : []),
    ...(canShowPos(permissions)
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
    ...(canViewSettings
      ? [{ label: 'Settings', path: '/dashboard/settings', icon: <SettingsOutlinedIcon fontSize="small" /> }]
      : [])
  ];

  const hubLinks: NavItem[] = [
    ...(canShowAccess(permissions)
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
            <Tooltip title={desktopNavCollapsed ? 'Expand navigation' : 'Collapse navigation'} arrow>
              <IconButton
                aria-label={desktopNavCollapsed ? 'Expand navigation' : 'Collapse navigation'}
                edge="start"
                onClick={() => setDesktopNavCollapsed((prev) => !prev)}
                sx={{ display: { xs: 'none', md: 'inline-flex' } }}
              >
                {desktopNavCollapsed ? <MenuIcon /> : <MenuOpenIcon />}
              </IconButton>
            </Tooltip>
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
        {isAuthenticated ? (
          <MenuItem component={Link} to="/dashboard/settings" onClick={onCloseProfileMenu}>
            <ListItemIcon>
              <SettingsOutlinedIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText>Settings</ListItemText>
          </MenuItem>
        ) : null}
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
      <Box component="nav" sx={{ width: { md: desktopDrawerWidth }, flexShrink: { md: 0 }, transition: 'width 200ms ease' }}>
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
                  {coreLinks.map((item) => renderNavLink(item))}
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
                  {hubLinks.map((item) => renderNavLink(item))}
                </Box>
              )}
            </List>
          </Box>
        </Drawer>
        <Drawer
          variant="permanent"
          sx={{
            display: { xs: 'none', md: 'block' },
            width: desktopDrawerWidth,
            flexShrink: 0,
            [`& .MuiDrawer-paper`]: {
              width: desktopDrawerWidth,
              boxSizing: 'border-box',
              overflowX: 'hidden',
              transition: 'width 200ms ease',
              display: 'flex',
              flexDirection: 'column'
            }
          }}
          open
        >
          <Toolbar />
          <Box sx={{ overflow: 'auto', p: desktopNavCollapsed ? 1 : 1.5, flexGrow: 1 }}>
            <List>
              {coreLinks.length > 0 && (
                <Box sx={{ mb: 1 }}>
                  {!desktopNavCollapsed && (
                    <Typography
                      variant="overline"
                      color="text.secondary"
                      sx={{ display: 'block', px: 1.5, pb: 0.5, lineHeight: 1.8 }}
                    >
                      Core
                    </Typography>
                  )}
                  {coreLinks.map((item) => renderNavLink(item, { collapsed: desktopNavCollapsed }))}
                  <Divider sx={{ my: 0.5 }} />
                </Box>
              )}
              {hubLinks.length > 0 && (
                <Box sx={{ mt: 0.5 }}>
                  {!desktopNavCollapsed && (
                    <Typography
                      variant="overline"
                      color="text.secondary"
                      sx={{ display: 'block', px: 1.5, pb: 0.5, lineHeight: 1.8 }}
                    >
                      Workspaces
                    </Typography>
                  )}
                  {hubLinks.map((item) => renderNavLink(item, { collapsed: desktopNavCollapsed }))}
                </Box>
              )}
            </List>
          </Box>
          <Box sx={{ mt: 'auto', p: 0.75, borderTop: '1px solid', borderColor: 'divider', display: 'flex', justifyContent: desktopNavCollapsed ? 'center' : 'flex-end' }}>
            <Tooltip title={desktopNavCollapsed ? 'Expand navigation' : 'Collapse navigation'} arrow placement="right">
              <IconButton
                size="small"
                onClick={() => setDesktopNavCollapsed((prev) => !prev)}
                aria-label={desktopNavCollapsed ? 'Expand navigation' : 'Collapse navigation'}
              >
                {desktopNavCollapsed ? <MenuIcon fontSize="small" /> : <ChevronLeftIcon fontSize="small" />}
              </IconButton>
            </Tooltip>
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
