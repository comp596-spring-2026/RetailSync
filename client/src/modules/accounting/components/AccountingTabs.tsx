import { Paper, Tab, Tabs } from '@mui/material';
import { SyntheticEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

const tabItems = [
  { value: '/dashboard/accounting/statements', label: 'Statements' },
  { value: '/dashboard/accounting/ledger', label: 'Ledger' },
  { value: '/dashboard/accounting/quickbooks', label: 'QuickBooks Sync' },
  { value: '/dashboard/accounting/observability', label: 'Observability' }
];

export const AccountingTabs = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const selected = tabItems.find((item) => location.pathname.startsWith(item.value))?.value ?? tabItems[0].value;

  const onChange = (_event: SyntheticEvent, value: string) => {
    navigate(value);
  };

  return (
    <Paper sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
      <Tabs
        value={selected}
        onChange={onChange}
        variant="scrollable"
        allowScrollButtonsMobile
      >
        {tabItems.map((tab) => (
          <Tab key={tab.value} value={tab.value} label={tab.label} />
        ))}
      </Tabs>
    </Paper>
  );
};
