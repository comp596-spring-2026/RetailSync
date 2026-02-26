import { CssBaseline, ThemeProvider as MuiThemeProvider } from '@mui/material';
import { ReactNode } from 'react';
import { theme } from '../../theme';

type Props = {
  children: ReactNode;
};

export const ThemeProvider = ({ children }: Props) => {
  return (
    <MuiThemeProvider theme={theme}>
      <CssBaseline />
      {children}
    </MuiThemeProvider>
  );
};
