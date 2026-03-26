import { Paper, Tab, Tabs } from '@mui/material';
import { SyntheticEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

const tabItems: Array<{
  value: string;
  label: string;
  matchPrefixes?: string[];
}> = [
  { value: '/dashboard/quickbooks', label: 'Home' },
  { value: '/dashboard/quickbooks/chart-of-accounts', label: 'Chart of Accounts' },
  { value: '/dashboard/quickbooks/customers', label: 'Customers' },
  { value: '/dashboard/quickbooks/vendors', label: 'Vendors' },
  { value: '/dashboard/quickbooks/operations', label: 'Operations' },
  { value: '/dashboard/quickbooks/reports', label: 'Reports' },
  { value: '/dashboard/quickbooks/tax', label: 'Tax' },
  {
    value: '/dashboard/quickbooks/write/sales-receipt',
    label: 'Writes',
    matchPrefixes: ['/dashboard/quickbooks/write']
  },
  {
    value: '/dashboard/accounting/transactions/deposits',
    label: 'Live Reads',
    matchPrefixes: ['/dashboard/accounting/registers', '/dashboard/accounting/transactions']
  }
];

export const QuickBooksTabs = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const selected =
    tabItems.find((item) =>
      (item.matchPrefixes ?? [item.value]).some(
        (prefix) =>
          location.pathname === prefix || location.pathname.startsWith(`${prefix}/`) || location.pathname.startsWith(item.value)
      )
    )?.value ?? '/dashboard/quickbooks';

  const onChange = (_event: SyntheticEvent, value: string) => {
    navigate(value);
  };

  return (
    <Paper sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
      <Tabs value={selected} onChange={onChange} variant="scrollable" allowScrollButtonsMobile>
        {tabItems.map((tab) => (
          <Tab key={tab.value} value={tab.value} label={tab.label} />
        ))}
      </Tabs>
    </Paper>
  );
};
