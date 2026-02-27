import {
  Alert,
  Button,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography
} from '@mui/material';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import { useEffect } from 'react';
import { useAppDispatch, useAppSelector } from '../../app/store/hooks';
import { LoadingEmptyStateWrapper } from '../../components';
import { PermissionGate } from '../../app/guards';
import { hasPermission } from '../../utils/permissions';
import { deleteItem, fetchItems, selectItems, selectItemsError, selectItemsLoading } from '../../slices/items/itemsSlice';

export const ItemsTableSection = () => {
  const dispatch = useAppDispatch();
  const permissions = useAppSelector((state) => state.auth.permissions);
  const items = useAppSelector(selectItems);
  const loading = useAppSelector(selectItemsLoading);
  const error = useAppSelector(selectItemsError);
  const canDelete = hasPermission(permissions, 'items', 'delete');

  useEffect(() => {
    if (!loading && items.length === 0 && !error) {
      void dispatch(fetchItems());
    }
  }, [dispatch, items.length, loading, error]);

  const removeItem = async (id: string) => {
    await dispatch(deleteItem(id));
  };

  return (
    <>
      {error && <Alert severity="error">{error}</Alert>}

      <LoadingEmptyStateWrapper
        loading={loading}
        empty={!loading && items.length === 0}
        loadingLabel="Loading items..."
        emptyMessage="No items yet"
        emptySecondary="Create an item above or import a CSV."
      >
        <Paper sx={{ p: 2 }}>
          <Typography variant="h6" sx={{ mb: 1 }}>
            Items
          </Typography>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Barcode</TableCell>
                <TableCell>Description</TableCell>
                <TableCell>Department</TableCell>
                <TableCell>Price</TableCell>
                <TableCell>SKU</TableCell>
                <TableCell>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {items.map((item) => (
                <TableRow key={item._id}>
                  <TableCell>{item.barcode}</TableCell>
                  <TableCell>{item.description}</TableCell>
                  <TableCell>{item.department}</TableCell>
                  <TableCell>{item.price.toFixed(2)}</TableCell>
                  <TableCell>{item.sku || '-'}</TableCell>
                  <TableCell>
                    <Stack direction="row" spacing={1}>
                      {/* Quick Edit can be wired to a dedicated thunk later */}
                      <PermissionGate module="items" action="delete" mode="disable">
                        <Button
                          size="small"
                          color="error"
                          variant="outlined"
                          startIcon={<DeleteOutlineIcon />}
                          disabled={!canDelete}
                          onClick={() => void removeItem(item._id)}
                        >
                          Delete
                        </Button>
                      </PermissionGate>
                    </Stack>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Paper>
      </LoadingEmptyStateWrapper>
    </>
  );
};

