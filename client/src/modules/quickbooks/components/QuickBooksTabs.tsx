import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { Button, Stack, Typography } from '@mui/material';
import { useLocation, useNavigate } from 'react-router-dom';
import { QUICKBOOKS_BASE_PATH, QUICKBOOKS_QUICK_ACCESS_ITEMS } from '../constants';

export const QuickBooksTabs = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const selected =
    QUICKBOOKS_QUICK_ACCESS_ITEMS.find((item) =>
      item.matchPrefixes.some(
        (prefix) =>
          location.pathname === prefix ||
          location.pathname.startsWith(`${prefix}/`) ||
          location.pathname.startsWith(item.to)
      )
    )?.to ?? QUICKBOOKS_BASE_PATH;

  const currentLabel =
    QUICKBOOKS_QUICK_ACCESS_ITEMS.find((item) => item.to === selected)?.title ?? 'QuickBooks';

  return (
    <Stack direction="row" justifyContent="space-between" alignItems="center">
      <Button
        variant="text"
        startIcon={<ArrowBackIcon />}
        onClick={() => navigate(QUICKBOOKS_BASE_PATH)}
        sx={{ alignSelf: 'flex-start' }}
      >
        Back to QuickBooks
      </Button>
      <Typography variant="body2" color="text.secondary">
        {currentLabel}
      </Typography>
    </Stack>
  );
};

