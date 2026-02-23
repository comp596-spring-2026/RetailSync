import { createTheme } from '@mui/material/styles';

export const theme = createTheme({
  palette: {
    mode: 'light',
    primary: { main: '#3d9c74', light: '#9cccb4', dark: '#2c7658', contrastText: '#ffffff' },
    secondary: { main: '#1f6f53' },
    success: { main: '#15803d' },
    error: { main: '#b91c1c' },
    warning: { main: '#b45309' },
    info: { main: '#0f766e' },
    background: { default: '#f4faf7', paper: '#ffffff' }
  },
  typography: {
    fontFamily: '"Public Sans", "Inter", "Segoe UI", sans-serif',
    h4: { fontWeight: 700 },
    h5: { fontWeight: 700 },
    h6: { fontWeight: 700 },
    subtitle1: { fontWeight: 600 },
    subtitle2: { fontWeight: 600 }
  },
  shape: {
    borderRadius: 12
  },
  components: {
    MuiPaper: {
      styleOverrides: {
        root: {
          border: '1px solid #e2e8f0',
          boxShadow: '0 10px 24px rgba(15, 23, 42, 0.06)'
        }
      }
    },
    MuiButton: {
      defaultProps: {
        disableElevation: true
      },
      styleOverrides: {
        root: {
          borderRadius: 10,
          textTransform: 'none',
          fontWeight: 600
        }
      }
    },
    MuiAppBar: {
      styleOverrides: {
        root: {
          backgroundImage: 'linear-gradient(90deg, #2c7658 0%, #3d9c74 100%)'
        }
      }
    },
    MuiTableHead: {
      styleOverrides: {
        root: {
          backgroundColor: '#f8fafc'
        }
      }
    }
  }
});
