import { Stack } from '@mui/material';
import InventoryIcon from '@mui/icons-material/Inventory';
import { useAppSelector } from '../../app/store/hooks';
import { NoAccess, PageHeader } from '../../components';
import { hasPermission } from '../../utils/permissions';
import { InventorySections } from '../../components/inventory/InventorySections';

export const InventoryPage = () => {
  const permissions = useAppSelector((state) => state.auth.permissions);

  const canView = hasPermission(permissions, 'inventory', 'view');

  if (!canView) {
    return <NoAccess />;
  }

  return (
    <Stack spacing={2}>
      <PageHeader
        title="Inventory"
        subtitle="Search stock, inspect locations, and move quantities"
        icon={<InventoryIcon />}
      />
      <InventorySections />
    </Stack>
  );
};
