import {
  Alert,
  Button,
  InputAdornment,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import PlaceIcon from '@mui/icons-material/Place';
import TransformIcon from '@mui/icons-material/Transform';
import InventoryIcon from '@mui/icons-material/Inventory';
import MoveUpIcon from '@mui/icons-material/MoveUp';
import { useEffect, useState } from 'react';
import { inventoryApi } from '../api/inventoryApi';
import { itemsApi } from '../api/itemsApi';
import { useAppDispatch, useAppSelector } from '../app/hooks';
import { NoAccess } from '../components/NoAccess';
import { PermissionGate } from '../components/PermissionGate';
import { PageHeader } from '../components/PageHeader';
import { showSnackbar } from '../features/ui/uiSlice';
import { hasPermission } from '../utils/permissions';

type StockRow = {
  itemId: string;
  barcode: string;
  upc: string;
  description: string;
  department: string;
  qty: number;
};

type LocationStockResponse = {
  location: { code: string; label: string; type: string };
  items: StockRow[];
};

type Item = {
  _id: string;
  barcode: string;
  description: string;
};

export const InventoryPage = () => {
  const dispatch = useAppDispatch();
  const permissions = useAppSelector((state) => state.auth.permissions);

  const canView = hasPermission(permissions, 'inventory', 'view');
  const canEdit = hasPermission(permissions, 'inventory', 'edit');
  const canMove = hasPermission(permissions, 'inventory', 'actions:move');

  const [barcode, setBarcode] = useState('');
  const [locationCode, setLocationCode] = useState('');
  const [stock, setStock] = useState<LocationStockResponse | null>(null);
  const [match, setMatch] = useState<Item | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [move, setMove] = useState({ itemId: '', fromLocationCode: '', toLocationCode: '', qty: '1', notes: '' });

  const searchBarcode = async () => {
    try {
      const res = await itemsApi.list(barcode.trim());
      const item = res.data.data?.[0] ?? null;
      setMatch(item);
      if (item) {
        setMove((prev) => ({ ...prev, itemId: item._id }));
      }
    } catch (err) {
      console.error(err);
      setError('Failed to search barcode');
    }
  };

  const loadByLocation = async () => {
    if (!locationCode.trim()) return;
    setError(null);
    try {
      const res = await inventoryApi.byLocation(locationCode.trim());
      setStock(res.data.data);
    } catch (err) {
      setError('Failed to load location inventory');
      console.error(err);
    }
  };

  useEffect(() => {
    if (canView) {
      void loadByLocation();
    }
  }, [canView]);

  const moveInventory = async () => {
    await inventoryApi.move({
      itemId: move.itemId,
      fromLocationCode: move.fromLocationCode,
      toLocationCode: move.toLocationCode,
      qty: Number(move.qty),
      notes: move.notes
    });
    dispatch(showSnackbar({ message: 'Inventory moved', severity: 'success' }));
    await loadByLocation();
  };

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
      <Paper sx={{ p: 3 }}>
        <Typography variant="h6" sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
          <SearchIcon fontSize="small" color="primary" />
          Search Item by Barcode
        </Typography>
        <Stack direction="row" spacing={2} alignItems="center">
          <TextField
            label="Barcode"
            value={barcode}
            onChange={(e) => setBarcode(e.target.value)}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon fontSize="small" />
                </InputAdornment>
              )
            }}
          />
          <Button variant="outlined" startIcon={<SearchIcon />} onClick={() => void searchBarcode()}>
            Search
          </Button>
          {match && (
            <Typography variant="body2">
              Match: {match.description} ({match.barcode})
            </Typography>
          )}
        </Stack>
      </Paper>

      <Paper sx={{ p: 3 }}>
        <Typography variant="h6" sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
          <PlaceIcon fontSize="small" color="primary" />
          View Inventory by Location
        </Typography>
        <Stack direction="row" spacing={2} alignItems="center">
          <TextField label="Location Code" value={locationCode} onChange={(e) => setLocationCode(e.target.value)} />
          <Button variant="outlined" startIcon={<PlaceIcon />} onClick={() => void loadByLocation()}>
            Load
          </Button>
          {stock && <Typography variant="body2">{stock.location.label}</Typography>}
        </Stack>
      </Paper>

      <Paper sx={{ p: 3 }}>
        <Typography variant="h6" sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
          <TransformIcon fontSize="small" color="primary" />
          Move Inventory
        </Typography>
        <Stack direction="row" spacing={2} flexWrap="wrap">
          <TextField
            label="Item ID"
            value={move.itemId}
            onChange={(e) => setMove((prev) => ({ ...prev, itemId: e.target.value }))}
            sx={{ minWidth: 280 }}
          />
          <TextField
            label="From"
            value={move.fromLocationCode}
            onChange={(e) => setMove((prev) => ({ ...prev, fromLocationCode: e.target.value }))}
          />
          <TextField
            label="To"
            value={move.toLocationCode}
            onChange={(e) => setMove((prev) => ({ ...prev, toLocationCode: e.target.value }))}
          />
          <TextField label="Qty" type="number" value={move.qty} onChange={(e) => setMove((prev) => ({ ...prev, qty: e.target.value }))} />
          <TextField label="Notes" value={move.notes} onChange={(e) => setMove((prev) => ({ ...prev, notes: e.target.value }))} />
          <PermissionGate module="inventory" action="actions:move" mode="disable">
            <Button
              variant="contained"
              startIcon={<MoveUpIcon />}
              disabled={!canEdit || !canMove}
              onClick={() => void moveInventory()}
            >
              Move
            </Button>
          </PermissionGate>
        </Stack>
      </Paper>

      {error && <Alert severity="error">{error}</Alert>}

      <Paper sx={{ p: 2 }}>
        <Typography variant="h6" sx={{ mb: 1 }}>
          Location Stock
        </Typography>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Barcode</TableCell>
              <TableCell>Description</TableCell>
              <TableCell>Department</TableCell>
              <TableCell>Qty</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {stock?.items.map((row) => (
              <TableRow key={row.itemId}>
                <TableCell>{row.barcode}</TableCell>
                <TableCell>{row.description}</TableCell>
                <TableCell>{row.department}</TableCell>
                <TableCell>{row.qty.toFixed(2)}</TableCell>
              </TableRow>
            )) ?? null}
          </TableBody>
        </Table>
      </Paper>
    </Stack>
  );
};
