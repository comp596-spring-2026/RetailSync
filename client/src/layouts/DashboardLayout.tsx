import {
  AppBar,
  Box,
  Button,
  CssBaseline,
  Drawer,
  List,
  ListItemButton,
  ListItemText,
  Toolbar,
  Typography
} from '@mui/material';
import { moduleKeys } from '@retailsync/shared';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '../app/hooks';
import { authApi } from '../api/authApi';
import { clearCompany } from '../features/company/companySlice';
import { logout } from '../features/auth/authSlice';
import { hasPermission } from '../utils/permissions';

const drawerWidth = 260;

const labelMap: Record<string, string> = {
  dashboard: 'Dashboard',
  pos: 'POS',
  items: 'Items',
  invoices: 'Invoices',
  inventory: 'Inventory',
  locations: 'Locations',
  reconciliation: 'Reconciliation',
  bankStatements: 'Bank Statements',
  suppliers: 'Suppliers',
  reports: 'Reports',
  users: 'Users',
  rolesSettings: 'Roles & Settings'
};

export const DashboardLayout = () => {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const location = useLocation();
  const permissions = useAppSelector((state) => state.auth.permissions);

  const onLogout = async () => {
    try {
      await authApi.logout();
    } finally {
      dispatch(logout());
      dispatch(clearCompany());
      navigate('/login', { replace: true });
    }
  };

  const links = moduleKeys.filter((module) => hasPermission(permissions, module, 'view'));

  return (
    <Box sx={{ display: 'flex' }}>
      <CssBaseline />
      <AppBar position="fixed" sx={{ zIndex: (theme) => theme.zIndex.drawer + 1 }}>
        <Toolbar sx={{ display: 'flex', justifyContent: 'space-between' }}>
          <Typography variant="h6">RetailSync</Typography>
          <Button color="inherit" onClick={onLogout}>
            Logout
          </Button>
        </Toolbar>
      </AppBar>
      <Drawer
        variant="permanent"
        sx={{
          width: drawerWidth,
          flexShrink: 0,
          [`& .MuiDrawer-paper`]: { width: drawerWidth, boxSizing: 'border-box' }
        }}
      >
        <Toolbar />
        <Box sx={{ overflow: 'auto' }}>
          <List>
            {links.map((module) => {
              const path = module === 'dashboard' ? '/dashboard' : `/dashboard/${module}`;
              return (
                <ListItemButton key={module} component={Link} to={path} selected={location.pathname === path}>
                  <ListItemText primary={labelMap[module]} />
                </ListItemButton>
              );
            })}
            {hasPermission(permissions, 'rolesSettings', 'view') && (
              <>
                <ListItemButton component={Link} to="/dashboard/roles" selected={location.pathname === '/dashboard/roles'}>
                  <ListItemText primary="Roles" />
                </ListItemButton>
                <ListItemButton component={Link} to="/dashboard/users" selected={location.pathname === '/dashboard/users'}>
                  <ListItemText primary="Users" />
                </ListItemButton>
              </>
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
