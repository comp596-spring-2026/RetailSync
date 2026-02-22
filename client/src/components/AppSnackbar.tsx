import { Alert, Snackbar } from '@mui/material';
import { useAppDispatch, useAppSelector } from '../app/hooks';
import { hideSnackbar } from '../features/ui/uiSlice';

export const AppSnackbar = () => {
  const dispatch = useAppDispatch();
  const snackbar = useAppSelector((state) => state.ui);

  return (
    <Snackbar
      open={snackbar.open}
      autoHideDuration={3200}
      anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
      onClose={() => dispatch(hideSnackbar())}
    >
      <Alert variant="filled" severity={snackbar.severity} onClose={() => dispatch(hideSnackbar())}>
        {snackbar.message}
      </Alert>
    </Snackbar>
  );
};
