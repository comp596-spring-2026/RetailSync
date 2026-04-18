import { Paper, Tab, Tabs } from '@mui/material';
import { SyntheticEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

const tabItems: Array<{
  value: string;
  label: string;
  matchPrefixes?: string[];
}> = [
  { value: '/dashboard/accounting/statements', label: 'Statements' }
];

export const AccountingTabs = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const selected =
    tabItems.find((item) => {
      const prefixes = item.matchPrefixes ?? [item.value];
      return prefixes.some(
        (prefix) =>
          location.pathname === prefix || location.pathname.startsWith(`${prefix}/`) || location.pathname.startsWith(item.value)
      );
    })?.value ?? tabItems[0].value;

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
