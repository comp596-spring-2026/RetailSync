import PaidOutlinedIcon from '@mui/icons-material/PaidOutlined';
import ReceiptLongOutlinedIcon from '@mui/icons-material/ReceiptLongOutlined';
import { Alert, Stack } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { NoAccess, PageHeader } from '../../../components';
import { useAppSelector } from '../../../app/store/hooks';
import { hasPermission } from '../../../utils/permissions';
import { canQuickBooksWrite } from '../../../utils/quickbooksPermissions';
import { QuickBooksCard } from '../components/QuickBooksCard';
import { QuickBooksTabs, RequireQuickBooksConnection } from '../components';
import { useQuickBooksWorkspace } from '../hooks/useQuickBooksWorkspace';

export const SalesPage = () => {
  const navigate = useNavigate();
  const permissions = useAppSelector((state) => state.auth.permissions);
  const canView = hasPermission(permissions, 'quickbooks', 'view');
  const canWrite = canQuickBooksWrite(permissions);
  const { loading, isConnected, error, warning } = useQuickBooksWorkspace(canView);

  if (!canView) {
    return <NoAccess />;
  }

  return (
    <Stack spacing={2}>
      <PageHeader
        title="QuickBooks Sales"
        subtitle="Work with customer-facing receivables, from invoices through received payments."
        icon={<ReceiptLongOutlinedIcon />}
      />
      <QuickBooksTabs />
      <RequireQuickBooksConnection
        loading={loading}
        isConnected={isConnected}
        error={error}
        warning={warning}
      >
        {!canWrite ? (
          <Alert severity="info">
            You can browse invoices and payments. To create or edit them, enable QuickBooks Create/Edit/Delete or Full
            write access (Post) under Access → Roles.
          </Alert>
        ) : null}
        <Stack
          sx={{
            display: 'grid',
            gap: 2,
            gridTemplateColumns: {
              xs: '1fr',
              md: 'repeat(2, minmax(0, 1fr))'
            }
          }}
        >
          <QuickBooksCard
            title="Invoices"
            description="Create, review, edit, and delete invoices in the connected QuickBooks company."
            icon={ReceiptLongOutlinedIcon}
            onClick={() => navigate('/dashboard/quickbooks/sales/invoices')}
          />
          <QuickBooksCard
            title="Payments"
            description="Record received payments and manage invoice-linked payment activity."
            icon={PaidOutlinedIcon}
            onClick={() => navigate('/dashboard/quickbooks/sales/payments')}
          />
        </Stack>
      </RequireQuickBooksConnection>
    </Stack>
  );
};

export default SalesPage;
