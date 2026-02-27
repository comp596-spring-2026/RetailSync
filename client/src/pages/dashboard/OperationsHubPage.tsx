import { Paper, Tab, Tabs } from '@mui/material';
import TuneIcon from '@mui/icons-material/Tune';
import { useState } from 'react';
import { PageHeader } from '../../components';
import { ItemsPage } from './ItemsPage';
import { InventoryPage } from './InventoryPage';
import { LocationsPage } from './LocationsPage';

type OperationsTab = 'items' | 'inventory' | 'locations';

export const OperationsHubPage = () => {
  const [tab, setTab] = useState<OperationsTab>('items');

  return (
    <>
      <PageHeader
        title="Operations"
        subtitle="Manage catalog, stock movement, and store locations in one place"
        icon={<TuneIcon />}
      />
      <Paper sx={{ mt: 2, p: 1 }}>
        <Tabs
          value={tab}
          onChange={(_e, value: OperationsTab) => setTab(value)}
          variant="scrollable"
          allowScrollButtonsMobile
        >
          <Tab value="items" label="Items" />
          <Tab value="inventory" label="Inventory" />
          <Tab value="locations" label="Locations" />
        </Tabs>
      </Paper>

      {tab === 'items' && <ItemsPage />}
      {tab === 'inventory' && <InventoryPage />}
      {tab === 'locations' && <LocationsPage />}
    </>
  );
};
