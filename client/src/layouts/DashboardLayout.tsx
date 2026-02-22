import {
  AppBar,
  Avatar,
  Box,
  Button,
  Chip,
  CssBaseline,
  Drawer,
  ListItemIcon,
  List,
  ListItemButton,
  ListItemText,
  Toolbar,
  Typography
} from '@mui/material';
import DashboardIcon from '@mui/icons-material/Dashboard';
import PointOfSaleIcon from '@mui/icons-material/PointOfSale';
import Inventory2Icon from '@mui/icons-material/Inventory2';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import SyncAltIcon from '@mui/icons-material/SyncAlt';
import WarehouseIcon from '@mui/icons-material/Warehouse';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import AssessmentIcon from '@mui/icons-material/Assessment';
import GroupIcon from '@mui/icons-material/Group';
import AdminPanelSettingsIcon from '@mui/icons-material/AdminPanelSettings';
import LogoutIcon from '@mui/icons-material/Logout';
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

const iconMap: Record<string, JSX.Element> = {
  dashboard: <DashboardIcon fontSize="small" />,
  pos: <PointOfSaleIcon fontSize="small" />,
  items: <Inventory2Icon fontSize="small" />,
  invoices: <ReceiptLongIcon fontSize="small" />,
  inventory: <SyncAltIcon fontSize="small" />,
  locations: <WarehouseIcon fontSize="small" />,
  reconciliation: <SyncAltIcon fontSize="small" />,
  bankStatements: <AccountBalanceIcon fontSize="small" />,
  suppliers: <LocalShippingIcon fontSize="small" />,
  reports: <AssessmentIcon fontSize="small" />,
  users: <GroupIcon fontSize="small" />,
  rolesSettings: <AdminPanelSettingsIcon fontSize="small" />
};

export const DashboardLayout = () => {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const location = useLocation();
  const permissions = useAppSelector((state) => state.auth.permissions);
  const user = useAppSelector((state) => state.auth.user);
  const role = useAppSelector((state) => state.auth.role);
  const company = useAppSelector((state) => state.company.company);

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
          <Box>
            <Typography variant="h6">RetailSync</Typography>
            <Typography variant="caption" sx={{ opacity: 0.85 }}>
              {company?.name ?? 'No Company'}
            </Typography>
          </Box>
          <Button color="inherit" onClick={onLogout} startIcon={<LogoutIcon />}>
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
        <Box sx={{ overflow: 'auto', p: 1.5 }}>
          <Box
            sx={{
              p: 1.5,
              mb: 1.5,
              borderRadius: 2,
              border: '1px solid #e2e8f0',
              backgroundColor: '#f8fafc'
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Avatar sx={{ width: 34, height: 34, bgcolor: 'primary.main', fontSize: 14 }}>
                {user?.firstName?.[0]}
                {user?.lastName?.[0]}
              </Avatar>
              <Box>
                <Typography variant="subtitle2" sx={{ lineHeight: 1.2 }}>
                  {user ? `${user.firstName} ${user.lastName}` : 'User'}
                </Typography>
                <Chip size="small" label={role?.name ?? 'Role'} sx={{ mt: 0.5 }} />
              </Box>
            </Box>
          </Box>
          <List>
            {links.map((module) => {
              const path = module === 'dashboard' ? '/dashboard' : `/dashboard/${module}`;
              return (
                <ListItemButton
                  key={module}
                  component={Link}
                  to={path}
                  selected={location.pathname === path}
                  sx={{ borderRadius: 2, mb: 0.5 }}
                >
                  <ListItemIcon sx={{ minWidth: 36 }}>{iconMap[module]}</ListItemIcon>
                  <ListItemText primary={labelMap[module]} />
                </ListItemButton>
              );
            })}
            {hasPermission(permissions, 'rolesSettings', 'view') && (
              <ListItemButton
                component={Link}
                to="/dashboard/roles"
                selected={location.pathname === '/dashboard/roles'}
                sx={{ borderRadius: 2 }}
              >
                <ListItemIcon sx={{ minWidth: 36 }}>
                  <AdminPanelSettingsIcon fontSize="small" />
                </ListItemIcon>
                <ListItemText primary="Roles" />
              </ListItemButton>
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
