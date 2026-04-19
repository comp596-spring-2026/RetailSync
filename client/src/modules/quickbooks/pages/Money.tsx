import AccountBalanceWalletOutlinedIcon from '@mui/icons-material/AccountBalanceWalletOutlined';
import PaidOutlinedIcon from '@mui/icons-material/PaidOutlined';
import SavingsOutlinedIcon from '@mui/icons-material/SavingsOutlined';
import SwapHorizOutlinedIcon from '@mui/icons-material/SwapHorizOutlined';
import { Paper, Stack, Typography } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { NoAccess, PageHeader } from '../../../components';
import { useAppSelector } from '../../../app/store/hooks';
import { hasPermission } from '../../../utils/permissions';
import { QuickbooksCard } from '../components/QuickbooksCard';
import { QuickBooksTabs, RequireQuickBooksConnection } from '../components';
import { useQuickBooksWorkspace } from '../hooks/useQuickBooksWorkspace';

export const MoneyPage = () => {
  const navigate = useNavigate();
  const permissions = useAppSelector((state) => state.auth.permissions);
  const canView = hasPermission(permissions, 'quickbooks', 'view');
  const { loading, isConnected, error, warning } = useQuickBooksWorkspace(canView);

  if (!canView) {
    return <NoAccess />;
  }

  return (
    <Stack spacing={2}>
      <PageHeader
        title="QuickBooks Money"
        subtitle="Inspect live cash movement and bank-affecting transactions from QuickBooks."
        icon={<AccountBalanceWalletOutlinedIcon />}
      />
      <QuickBooksTabs />
      <RequireQuickBooksConnection
        loading={loading}
        isConnected={isConnected}
        error={error}
        warning={warning}
      >
        <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 2.5 }}>
          <Typography variant="body2" color="text.secondary">
            Deposits, checks, expenses, and transfers are read live from QuickBooks so the money workspace stays aligned with the connected company.
          </Typography>
        </Paper>
        <Stack
          sx={{
            display: 'grid',
            gap: 2,
            gridTemplateColumns: {
              xs: '1fr',
              sm: 'repeat(2, minmax(0, 1fr))'
            }
          }}
        >
          <QuickbooksCard
            title="Deposits"
            description="Review deposits and drill into the raw QuickBooks record."
            icon={SavingsOutlinedIcon}
            onClick={() => navigate('/dashboard/quickbooks/money/deposits')}
          />
          <QuickbooksCard
            title="Checks"
            description="Inspect check activity with account and payee details."
            icon={AccountBalanceWalletOutlinedIcon}
            onClick={() => navigate('/dashboard/quickbooks/money/checks')}
          />
          <QuickbooksCard
            title="Expenses"
            description="Open expenses posted in QuickBooks for live review."
            icon={PaidOutlinedIcon}
            onClick={() => navigate('/dashboard/quickbooks/money/expenses')}
          />
          <QuickbooksCard
            title="Transfers"
            description="Trace movement between accounts from the live QuickBooks ledger."
            icon={SwapHorizOutlinedIcon}
            onClick={() => navigate('/dashboard/quickbooks/money/transfers')}
          />
        </Stack>
      </RequireQuickBooksConnection>
    </Stack>
  );
};

export default MoneyPage;
