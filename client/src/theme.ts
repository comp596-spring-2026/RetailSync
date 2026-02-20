import { createTheme } from '@mui/material/styles';

export const theme = createTheme({
  palette: {
    mode: 'light',
    primary: { main: '#0b6bcb' },
    secondary: { main: '#0e9f6e' },
    background: { default: '#f4f7fb', paper: '#ffffff' }
  },
  shape: {
    borderRadius: 10
  }
});
