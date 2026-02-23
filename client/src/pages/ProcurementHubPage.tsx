import { Paper, Tab, Tabs } from '@mui/material';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import { useState } from 'react';
import { PageHeader } from '../components/PageHeader';
import { ModuleShellPage } from './ModuleShellPage';

type ProcurementTab = 'invoices' | 'suppliers';

export const ProcurementHubPage = () => {
  const [tab, setTab] = useState<ProcurementTab>('invoices');

  return (
    <>
      <PageHeader
        title="Procurement"
        subtitle="Manage invoice and supplier workflows together"
        icon={<ReceiptLongIcon />}
      />
      <Paper sx={{ mt: 2, p: 1 }}>
        <Tabs
          value={tab}
          onChange={(_e, value: ProcurementTab) => setTab(value)}
          variant="scrollable"
          allowScrollButtonsMobile
        >
          <Tab value="invoices" label="Invoices" />
          <Tab value="suppliers" label="Suppliers" />
        </Tabs>
      </Paper>

      {tab === 'invoices' && <ModuleShellPage module="invoices" />}
      {tab === 'suppliers' && <ModuleShellPage module="suppliers" />}
    </>
  );
};
