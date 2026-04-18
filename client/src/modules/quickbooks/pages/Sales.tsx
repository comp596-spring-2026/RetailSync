import PaidOutlinedIcon from '@mui/icons-material/PaidOutlined';
import ReceiptLongOutlinedIcon from '@mui/icons-material/ReceiptLongOutlined';
import { Paper, Stack, Typography } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { NoAccess, PageHeader } from '../../../components';
import { useAppSelector } from '../../../app/store/hooks';
import { hasPermission } from '../../../utils/permissions';
import { QuickBooksTabs, RequireQuickBooksConnection } from '../../accounting/components';
import { useQuickBooksWorkspace } from '../../accounting/hooks/useQuickBooksWorkspace';
import { QuickbooksCard } from '../components/QuickbooksCard';

export const SalesPage = () => {
  const navigate = useNavigate();
  const permissions = useAppSelector((state) => state.auth.permissions);
  const canView = hasPermission(permissions, 'quickbooks', 'view');
  const canPost = hasPermission(permissions, 'quickbooks', 'actions:post');
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
        <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 2.5 }}>
          <Typography variant="body2" color="text.secondary">
            {canPost
              ? 'Open invoices or payments to browse records, create new ones, edit live QuickBooks data, and review posting details.'
              : 'Open invoices or payments to browse records and review QuickBooks detail. Create and edit actions require QuickBooks post access.'}
          </Typography>
        </Paper>
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
          <QuickbooksCard
            title="Invoices"
            description="Create, review, edit, and delete invoices in the connected QuickBooks company."
            icon={ReceiptLongOutlinedIcon}
            onClick={() => navigate('/dashboard/quickbooks/sales/invoices')}
          />
          <QuickbooksCard
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
