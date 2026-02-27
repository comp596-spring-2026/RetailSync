import { Stack } from '@mui/material';
import Inventory2Icon from '@mui/icons-material/Inventory2';
import { useAppSelector } from '../../app/store/hooks';
import { NoAccess, PageHeader } from '../../components';
import { hasPermission } from '../../utils/permissions';
import { ItemsImportSection } from '../../components/items/ItemsImportSection';
import { ItemsFormSection } from '../../components/items/ItemsFormSection';
import { ItemsTableSection } from '../../components/items/ItemsTableSection';

export const ItemsPage = () => {
  const permissions = useAppSelector((state) => state.auth.permissions);

  const canView = hasPermission(permissions, 'items', 'view');

  if (!canView) {
    return <NoAccess />;
  }

  return (
    <Stack spacing={2}>
      <PageHeader title="Items" subtitle="Manage catalog and import item files" icon={<Inventory2Icon />} />
      <ItemsImportSection onImported={() => Promise.resolve()} />
      <ItemsFormSection onCreated={() => Promise.resolve()} />
      <ItemsTableSection />
    </Stack>
  );
};
