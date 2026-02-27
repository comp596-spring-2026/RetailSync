import { Component, ErrorInfo, ReactNode } from 'react';
import { Alert, Box, Button, Paper, Stack, Typography } from '@mui/material';

type ErrorBoundaryProps = {
  children: ReactNode;
};

type ErrorBoundaryState = {
  hasError: boolean;
};

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = {
    hasError: false
  };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Unhandled UI error', error, errorInfo);
  }

  private handleReload = () => {
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <Box
        sx={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          p: 2,
          backgroundColor: 'background.default'
        }}
      >
        <Paper elevation={2} sx={{ maxWidth: 560, width: '100%', p: 3 }}>
          <Stack spacing={2}>
            <Typography variant="h5">Something went wrong</Typography>
            <Alert severity="error">
              The application hit an unexpected error. Reload to recover.
            </Alert>
            <Button variant="contained" onClick={this.handleReload}>
              Reload app
            </Button>
          </Stack>
        </Paper>
      </Box>
    );
  }
}
