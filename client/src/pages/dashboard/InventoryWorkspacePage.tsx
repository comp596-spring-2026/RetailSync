import { Button, Grid2 as Grid, Stack } from '@mui/material';
import InventoryIcon from '@mui/icons-material/Inventory';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import AddBoxIcon from '@mui/icons-material/AddBox';
import SearchIcon from '@mui/icons-material/Search';
import PlaceIcon from '@mui/icons-material/Place';
import TransformIcon from '@mui/icons-material/Transform';
import { useState } from 'react';
import { useAppSelector } from '../../app/store/hooks';
import { hasPermission } from '../../utils/permissions';
import { NoAccess, PageHeader } from '../../components';
import { SectionHeader, ActionCard } from '../../components/common';
import { ItemsTableSection } from '../../components/items/ItemsTableSection';
import { ImportItemsModal } from '../../components/items/ImportItemsModal';
import { CreateItemModal } from '../../components/items/CreateItemModal';
import { BarcodeSearchModal } from '../../components/inventory/BarcodeSearchModal';
import { StoreLayoutViewer } from '../../components/inventory/layout/StoreLayoutViewer';

export const InventoryWorkspacePage = () => {
  const permissions = useAppSelector((state) => state.auth.permissions);
  const canView =
    hasPermission(permissions, 'items', 'view') ||
    hasPermission(permissions, 'inventory', 'view') ||
    hasPermission(permissions, 'locations', 'view');

  const [importOpen, setImportOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [barcodeOpen, setBarcodeOpen] = useState(false);

  if (!canView) {
    return <NoAccess />;
  }

  return (
    <Stack spacing={2}>
      <Stack direction="row" justifyContent="space-between" alignItems="center">
        <PageHeader
          title="Inventory"
          subtitle="Manage items, stock, and store locations"
          icon={<InventoryIcon />}
        />
        <Stack direction="row" spacing={1}>
          <Button
            variant="outlined"
            size="small"
            startIcon={<UploadFileIcon />}
            onClick={() => setImportOpen(true)}
          >
            Import CSV / Excel
          </Button>
          <Button
            variant="outlined"
            size="small"
            startIcon={<AddBoxIcon />}
            onClick={() => setCreateOpen(true)}
          >
            Create Item
          </Button>
          <Button
            variant="contained"
            size="small"
            startIcon={<SearchIcon />}
            onClick={() => setBarcodeOpen(true)}
          >
            Scan / Search
          </Button>
        </Stack>
      </Stack>

      {/* Section A: Inventory table */}
      <Stack spacing={1.5}>
        <SectionHeader title="Inventory" icon={<InventoryIcon fontSize="small" />} />
        <ItemsTableSection />
      </Stack>

      {/* Section B: Locations + Layout */}
      <Stack spacing={1.5}>
        <SectionHeader title="Locations & Layout" icon={<PlaceIcon fontSize="small" />} />
        <Grid container spacing={2}>
          <Grid size={{ xs: 12, md: 4 }}>
            <Stack spacing={1.5}>
              <ActionCard
                title="Create Location"
                description="Add a new shelf, cooler, or storage area."
                icon={<PlaceIcon fontSize="small" color="primary" />}
                onClick={() => {
                  // Reuse Locations page for now; modal version can be added later.
                  window.location.href = '/dashboard/locations';
                }}
              />
              <ActionCard
                title="View Inventory by Location"
                description="See all items stored at a specific location."
                icon={<InventoryIcon fontSize="small" color="primary" />}
                onClick={() => {
                  window.location.href = '/dashboard/inventory';
                }}
              />
              <ActionCard
                title="Move Inventory"
                description="Transfer quantities between locations."
                icon={<TransformIcon fontSize="small" color="primary" />}
                onClick={() => {
                  window.location.href = '/dashboard/inventory';
                }}
              />
            </Stack>
          </Grid>
          <Grid size={{ xs: 12, md: 8 }}>
            <StoreLayoutViewer />
          </Grid>
        </Grid>
      </Stack>

      <ImportItemsModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImported={() => Promise.resolve()}
      />
      <CreateItemModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={() => Promise.resolve()}
      />
      <BarcodeSearchModal open={barcodeOpen} onClose={() => setBarcodeOpen(false)} />
    </Stack>
  );
};

