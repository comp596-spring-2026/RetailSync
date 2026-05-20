import PeopleAltIcon from '@mui/icons-material/PeopleAlt';
import StorefrontIcon from '@mui/icons-material/Storefront';
import {
  Alert,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Stack,
  TextField,
  Typography
} from '@mui/material';
import { type GridColDef, type GridSortModel } from '@mui/x-data-grid';
import type {
  QuickBooksContactCreateInput,
  QuickBooksContactUpdateInput
} from '@retailsync/shared';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { NoAccess, PageHeader, SmartTable } from '../../../components';
import { useAppDispatch, useAppSelector } from '../../../app/store/hooks';
import { showSnackbar } from '../../../app/store/uiSlice';
import { extractApiErrorMessage } from '../../../utils/apiError';
import { hasPermission } from '../../../utils/permissions';
import {
  canQuickBooksCreate,
  canQuickBooksDelete,
  canQuickBooksEdit,
  canQuickBooksWrite
} from '../../../utils/quickbooksPermissions';
import { accountingApi } from '../../accounting/api';
import { QuickBooksTabs, RequireQuickBooksConnection } from '../components';
import { useQuickBooksWorkspace } from '../hooks/useQuickBooksWorkspace';
import {
  quickBooksHubSortToParam,
  type QuickBooksHubEntitiesParams,
  type QuickBooksHubEntityRow,
  type QuickBooksHubEntityType,
  type QuickBooksHubSortModel
} from '../types/quickbooksHub';

type SupportedEntityType = Exclude<QuickBooksHubEntityType, 'employee'>;

type ContactFormState = {
  displayName: string;
  companyName: string;
  givenName: string;
  familyName: string;
  email: string;
  phone: string;
};

const blankForm: ContactFormState = {
  displayName: '',
  companyName: '',
  givenName: '',
  familyName: '',
  email: '',
  phone: ''
};

const statusOptions = [
  { label: 'All', value: 'all' },
  { label: 'Active', value: 'active' },
  { label: 'Inactive', value: 'inactive' }
] as const;

const entityMeta: Record<SupportedEntityType, { label: string; subtitle: string; icon: JSX.Element }> = {
  customer: {
    label: 'Customers',
    subtitle: 'Create, update, and deactivate customers without leaving the QuickBooks workspace.',
    icon: <PeopleAltIcon />
  },
  vendor: {
    label: 'Vendors',
    subtitle: 'Manage vendor records and keep payment-side references clean before writing checks or expenses.',
    icon: <StorefrontIcon />
  }
};

const toContactPayload = (form: ContactFormState): QuickBooksContactCreateInput => ({
  displayName: form.displayName.trim(),
  companyName: form.companyName.trim() || undefined,
  givenName: form.givenName.trim() || undefined,
  familyName: form.familyName.trim() || undefined,
  email: form.email.trim() || undefined,
  phone: form.phone.trim() || undefined
});

export const ContactsPage = () => {
  const dispatch = useAppDispatch();
  const permissions = useAppSelector((state) => state.auth.permissions);
  const canView = hasPermission(permissions, 'quickbooks', 'view');
  const canCreate = canQuickBooksCreate(permissions);
  const canEdit = canQuickBooksEdit(permissions);
  const canDelete = canQuickBooksDelete(permissions);
  const {
    loading: workspaceLoading,
    isConnected,
    error: workspaceError,
    warning: workspaceWarning
  } = useQuickBooksWorkspace(canView);

  const [entityType, setEntityType] = useState<SupportedEntityType>('customer');
  const [rows, setRows] = useState<QuickBooksHubEntityRow[]>([]);
  const [rowCount, setRowCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [sortModel, setSortModel] = useState<QuickBooksHubSortModel>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<'create' | 'edit'>('create');
  const [selectedQbId, setSelectedQbId] = useState<string | null>(null);
  const [form, setForm] = useState<ContactFormState>(blankForm);
  const [dialogBusy, setDialogBusy] = useState(false);
  const [dialogError, setDialogError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await accountingApi.getQuickbooksHubEntities(entityType, {
        page,
        pageSize,
        search: search || undefined,
        sort: quickBooksHubSortToParam(sortModel) as QuickBooksHubEntitiesParams['sort'],
        status: statusFilter === 'all' ? undefined : statusFilter
      });
      const payload = response.data.data;
      setRows(payload.items);
      setRowCount(payload.total);
      setPage(payload.page);
      setPageSize(payload.pageSize);
    } catch (apiError) {
      setError(
        extractApiErrorMessage(
          apiError,
          `Failed to load QuickBooks ${entityType === 'customer' ? 'customers' : 'vendors'}`
        )
      );
    } finally {
      setLoading(false);
    }
  }, [entityType, page, pageSize, search, sortModel, statusFilter]);

  useEffect(() => {
    if (!canView || !isConnected) return;
    void load();
  }, [canView, isConnected, load]);

  const openCreate = () => {
    setDialogMode('create');
    setSelectedQbId(null);
    setForm(blankForm);
    setDialogError(null);
    setDialogOpen(true);
  };

  const openEdit = async (qbId: string) => {
    setDialogMode('edit');
    setSelectedQbId(qbId);
    setDialogBusy(true);
    setDialogError(null);
    setDialogOpen(true);
    try {
      const response = await accountingApi.getQuickbooksContact(entityType, qbId);
      const detail = response.data.data;
      setForm({
        displayName: detail.displayName ?? '',
        companyName: detail.companyName ?? '',
        givenName: detail.givenName ?? '',
        familyName: detail.familyName ?? '',
        email: detail.email ?? '',
        phone: detail.phone ?? ''
      });
    } catch (apiError) {
      setDialogError(extractApiErrorMessage(apiError, 'Failed to load QuickBooks contact'));
    } finally {
      setDialogBusy(false);
    }
  };

  const closeDialog = (force = false) => {
    if (dialogBusy && !force) return;
    setDialogOpen(false);
    setDialogError(null);
    setSelectedQbId(null);
    setForm(blankForm);
    setDialogBusy(false);
  };

  const onSubmit = async () => {
    setDialogBusy(true);
    setDialogError(null);
    const payload = toContactPayload(form);
    try {
      if (dialogMode === 'create') {
        await accountingApi.postQuickbooksContact(entityType, payload);
        dispatch(
          showSnackbar({
            message: `${entityMeta[entityType].label.slice(0, -1)} created in QuickBooks.`,
            severity: 'success'
          })
        );
      } else if (selectedQbId) {
        await accountingApi.patchQuickbooksContact(
          entityType,
          selectedQbId,
          payload as QuickBooksContactUpdateInput
        );
        dispatch(
          showSnackbar({
            message: `${entityMeta[entityType].label.slice(0, -1)} updated in QuickBooks.`,
            severity: 'success'
          })
        );
      }
      closeDialog(true);
      await load();
    } catch (apiError) {
      setDialogError(extractApiErrorMessage(apiError, 'Failed to save QuickBooks contact'));
      setDialogBusy(false);
    }
  };

  const onDeactivate = async (row: QuickBooksHubEntityRow) => {
    const confirmed = window.confirm(
      `Deactivate ${row.displayName} in QuickBooks? You can reactivate it later directly in QuickBooks if needed.`
    );
    if (!confirmed) return;

    try {
      await accountingApi.deleteQuickbooksContact(entityType, row.qbId);
      dispatch(
        showSnackbar({
          message: `${entityMeta[entityType].label.slice(0, -1)} deactivated in QuickBooks.`,
          severity: 'success'
        })
      );
      await load();
    } catch (apiError) {
      setError(extractApiErrorMessage(apiError, 'Failed to deactivate QuickBooks contact'));
    }
  };

  const columns = useMemo<GridColDef<QuickBooksHubEntityRow>[]>(() => {
    const base: GridColDef<QuickBooksHubEntityRow>[] = [
      { field: 'displayName', headerName: 'Display Name', flex: 1, minWidth: 220 },
      { field: 'email', headerName: 'Email', flex: 1, minWidth: 220 },
      { field: 'phone', headerName: 'Phone', width: 160 },
      {
        field: 'balance',
        headerName: 'Balance',
        width: 150,
        align: 'right',
        headerAlign: 'right',
        renderCell: (params) =>
          params.value == null
            ? '-'
            : Number(params.value).toLocaleString('en-US', {
                style: 'currency',
                currency: 'USD'
              })
      },
      { field: 'qbId', headerName: 'QuickBooks ID', width: 160 },
      {
        field: 'status',
        headerName: 'Status',
        width: 120,
        renderCell: (params) => (
          <Chip
            size="small"
            color={params.value === 'active' ? 'success' : 'default'}
            label={String(params.value ?? 'unknown')}
          />
        )
      }
    ];

    if (!canEdit && !canDelete) {
      return base;
    }

    return [
      ...base,
      {
        field: 'actions',
        headerName: 'Actions',
        width: 180,
        sortable: false,
        filterable: false,
        renderCell: (params) => (
          <Stack direction="row" spacing={1}>
            {canEdit ? (
              <Button size="small" onClick={() => void openEdit(params.row.qbId)}>
                Edit
              </Button>
            ) : null}
            {canDelete ? (
              <Button
                size="small"
                color="error"
                onClick={() => void onDeactivate(params.row)}
                disabled={params.row.status === 'inactive'}
              >
                Deactivate
              </Button>
            ) : null}
          </Stack>
        )
      }
    ];
  }, [canDelete, canEdit, entityType]);

  const filters = useMemo(
    () => (
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25} flexWrap="wrap" useFlexGap>
        <Button
          variant={entityType === 'customer' ? 'contained' : 'outlined'}
          onClick={() => {
            setEntityType('customer');
            setPage(1);
          }}
        >
          Customers
        </Button>
        <Button
          variant={entityType === 'vendor' ? 'contained' : 'outlined'}
          onClick={() => {
            setEntityType('vendor');
            setPage(1);
          }}
        >
          Vendors
        </Button>
        {canCreate ? (
          <Button variant="contained" onClick={openCreate}>
            New {entityType === 'customer' ? 'Customer' : 'Vendor'}
          </Button>
        ) : null}
        <TextField
          select
          size="small"
          label="Status"
          value={statusFilter}
          onChange={(event) => {
            setStatusFilter(event.target.value as typeof statusFilter);
            setPage(1);
          }}
          sx={{ minWidth: 140 }}
        >
          {statusOptions.map((option) => (
            <MenuItem key={option.value} value={option.value}>
              {option.label}
            </MenuItem>
          ))}
        </TextField>
      </Stack>
    ),
    [canCreate, entityType, statusFilter]
  );

  if (!canView) {
    return <NoAccess />;
  }

  return (
    <Stack spacing={2}>
      <PageHeader
        title="QuickBooks Contacts"
        subtitle={entityMeta[entityType].subtitle}
        icon={entityMeta[entityType].icon}
      />
      <QuickBooksTabs />
      <RequireQuickBooksConnection
        loading={workspaceLoading}
        isConnected={isConnected}
        error={workspaceError}
        warning={workspaceWarning}
      >
        {!canQuickBooksWrite(permissions) ? (
          <Alert severity="info">
            Create and edit actions require QuickBooks write access. In Access → Roles, enable Create/Edit/Delete
            under QuickBooks, or turn on Full QuickBooks write access (Post).
          </Alert>
        ) : null}
        <SmartTable
          rows={rows}
          columns={columns}
          getRowId={(row) => row.id}
          rowCount={rowCount}
          page={page}
          pageSize={pageSize}
          onPageChange={setPage}
          onPageSizeChange={(value) => {
            setPageSize(value);
            setPage(1);
          }}
          sortModel={sortModel}
          onSortModelChange={(model: GridSortModel) => {
            setSortModel(model);
            setPage(1);
          }}
          searchValue={search}
          onSearchValueChange={(value) => {
            setSearch(value);
            setPage(1);
          }}
          searchPlaceholder={`Search ${entityMeta[entityType].label.toLowerCase()}`}
          filters={filters}
          loading={loading}
          error={error}
          emptyText={`No ${entityMeta[entityType].label.toLowerCase()} found.`}
          onRefresh={load}
        />
      </RequireQuickBooksConnection>

        <Dialog open={dialogOpen} onClose={() => closeDialog()} fullWidth maxWidth="sm">
        <DialogTitle>
          {dialogMode === 'create'
            ? `New ${entityType === 'customer' ? 'Customer' : 'Vendor'}`
            : `Edit ${entityType === 'customer' ? 'Customer' : 'Vendor'}`}
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {dialogError ? <Alert severity="error">{dialogError}</Alert> : null}
            <TextField
              label="Display Name"
              value={form.displayName}
              onChange={(event) => setForm((current) => ({ ...current, displayName: event.target.value }))}
              required
              fullWidth
              disabled={dialogBusy}
            />
            <TextField
              label="Company Name"
              value={form.companyName}
              onChange={(event) => setForm((current) => ({ ...current, companyName: event.target.value }))}
              fullWidth
              disabled={dialogBusy}
            />
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField
                label="First Name"
                value={form.givenName}
                onChange={(event) => setForm((current) => ({ ...current, givenName: event.target.value }))}
                fullWidth
                disabled={dialogBusy}
              />
              <TextField
                label="Last Name"
                value={form.familyName}
                onChange={(event) => setForm((current) => ({ ...current, familyName: event.target.value }))}
                fullWidth
                disabled={dialogBusy}
              />
            </Stack>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField
                label="Email"
                type="email"
                value={form.email}
                onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
                fullWidth
                disabled={dialogBusy}
              />
              <TextField
                label="Phone"
                value={form.phone}
                onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))}
                fullWidth
                disabled={dialogBusy}
              />
            </Stack>
          </Stack>
        </DialogContent>
        <DialogActions>
            <Button onClick={() => closeDialog()} disabled={dialogBusy}>
              Cancel
            </Button>
          <Button
            onClick={() => void onSubmit()}
            variant="contained"
            disabled={dialogBusy || !form.displayName.trim()}
          >
            {dialogBusy ? 'Saving...' : dialogMode === 'create' ? 'Create' : 'Save'}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
};

export default ContactsPage;
