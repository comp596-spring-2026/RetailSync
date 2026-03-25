import { Paper, Tab, Tabs } from '@mui/material';
import { SyntheticEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

const tabItems = [
  { value: '/dashboard/quickbooks', label: 'Home' },
  { value: '/dashboard/quickbooks/reports', label: 'Reports' },
  { value: '/dashboard/quickbooks/operations', label: 'Operations' },
  { value: '/dashboard/quickbooks/tax', label: 'Tax' }
];

export const QuickBooksTabs = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const selected =
    tabItems.find((item) =>
      item.value === '/dashboard/quickbooks'
        ? location.pathname === item.value
        : location.pathname.startsWith(item.value)
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

