import { Button, CircularProgress, Stack } from '@mui/material';
import BuildCircleIcon from '@mui/icons-material/BuildCircle';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import { ModuleKey } from '@retailsync/shared';
import { useMemo, useState } from 'react';
import { PermissionGate } from '../../app/guards';
import { ConfirmDeleteDialog, CrudEntityDialog, CrudField, NoAccess, PageHeader, SearchableCrudTable } from '../../components';
import { moduleActionsMap } from '../../constants/modules';
import { useAppSelector } from '../../app/store/hooks';
import { hasPermission } from '../../utils/permissions';
import { formatDate } from '../../utils/date';
import { useAsyncAction } from '../../hooks/useAsyncAction';

type ModuleShellProps = {
  module: ModuleKey;
};

type ModuleRecord = {
  id: string;
  name: string;
  reference: string;
  status: 'active' | 'draft' | 'archived';
  notes: string;
  updatedAt: string;
};

const defaultRows = (module: ModuleKey): ModuleRecord[] => [
  {
    id: `${module}-1`,
    name: `${module} baseline`,
    reference: `RS-${module.toUpperCase().slice(0, 4)}-001`,
    status: 'active',
    notes: 'Starter template',
    updatedAt: new Date().toISOString()
  }
];

const crudFields: CrudField[] = [
  { key: 'name', label: 'Name', required: true },
  { key: 'reference', label: 'Reference', required: true },
  {
    key: 'status',
    label: 'Status',
    required: true,
    options: [
      { label: 'Active', value: 'active' },
      { label: 'Draft', value: 'draft' },
      { label: 'Archived', value: 'archived' }
    ]
  },
  { key: 'notes', label: 'Notes', multiline: true }
];

export const ModuleShellPage = ({ module }: ModuleShellProps) => {
  const permissions = useAppSelector((state) => state.auth.permissions);
  const canView = hasPermission(permissions, module, 'view');
  const canCreate = hasPermission(permissions, module, 'create');
  const canEdit = hasPermission(permissions, module, 'edit');
  const canDelete = hasPermission(permissions, module, 'delete');
  const { loading, runAction } = useAsyncAction();
  const [rows, setRows] = useState<ModuleRecord[]>(() => defaultRows(module));
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [selected, setSelected] = useState<ModuleRecord | null>(null);

  if (!canView) {
    return <NoAccess />;
  }

  const title = module.charAt(0).toUpperCase() + module.slice(1);

  const columns = useMemo(
    () => [
      { id: 'name', label: 'Name', render: (row: ModuleRecord) => row.name },
      { id: 'reference', label: 'Reference', render: (row: ModuleRecord) => row.reference },
      { id: 'status', label: 'Status', render: (row: ModuleRecord) => row.status },
      { id: 'notes', label: 'Notes', render: (row: ModuleRecord) => row.notes || '-' },
      { id: 'updatedAt', label: 'Updated', render: (row: ModuleRecord) => formatDate(row.updatedAt, 'short') }
    ],
    []
  );

  const createRecord = async (values: Record<string, string>) => {
    await runAction(
      async () => {
        setRows((prev) => [
          {
            id: `${module}-${Date.now()}`,
            name: values.name.trim(),
            reference: values.reference.trim(),
            status: (values.status as ModuleRecord['status']) || 'draft',
            notes: values.notes?.trim() ?? '',
            updatedAt: new Date().toISOString()
          },
          ...prev
        ]);
        setCreateOpen(false);
      },
      { successMessage: `${title} record created`, errorMessage: 'Could not create record' }
    );
  };

  const editRecord = async (values: Record<string, string>) => {
    if (!selected) return;
    await runAction(
      async () => {
        setRows((prev) =>
          prev.map((row) =>
            row.id === selected.id
              ? {
                  ...row,
                  name: values.name.trim(),
                  reference: values.reference.trim(),
                  status: (values.status as ModuleRecord['status']) || row.status,
                  notes: values.notes?.trim() ?? '',
                  updatedAt: new Date().toISOString()
                }
              : row
          )
        );
        setEditOpen(false);
        setSelected(null);
      },
      { successMessage: `${title} record updated`, errorMessage: 'Could not update record' }
    );
  };

  const removeRecord = async () => {
    if (!selected) return;
    await runAction(
      async () => {
        setRows((prev) => prev.filter((row) => row.id !== selected.id));
        setDeleteOpen(false);
        setSelected(null);
      },
      { successMessage: `${title} record deleted`, errorMessage: 'Could not delete record' }
    );
  };

  return (
    <Stack spacing={2}>
      <PageHeader title={title} subtitle="RBAC-aware module shell and action controls" icon={<BuildCircleIcon />} />
      <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}>
        <PermissionGate module={module} action="create">
          <Button
            variant="contained"
            startIcon={loading ? <CircularProgress size={16} color="inherit" /> : <AddCircleOutlineIcon />}
            disabled={!canCreate || loading}
            onClick={() => setCreateOpen(true)}
          >
            Create Record
          </Button>
        </PermissionGate>
        {moduleActionsMap[module].map((custom) => (
          <PermissionGate key={custom} module={module} action={`actions:${custom}`}>
            <Button variant="outlined">{custom}</Button>
          </PermissionGate>
        ))}
      </Stack>
      <SearchableCrudTable
        rows={rows}
        columns={columns}
        getRowId={(row) => row.id}
        onEdit={
          canEdit
            ? (row) => {
                setSelected(row);
                setEditOpen(true);
              }
            : undefined
        }
        onDelete={
          canDelete
            ? (row) => {
                setSelected(row);
                setDeleteOpen(true);
              }
            : undefined
        }
        searchPlaceholder={`Search ${title} records`}
        emptyLabel="No records yet. Create one to get started."
      />
      <CrudEntityDialog
        open={createOpen}
        title={`Create ${title} Record`}
        fields={crudFields}
        loading={loading}
        onClose={() => setCreateOpen(false)}
        onSubmit={(values) => void createRecord(values)}
      />
      <CrudEntityDialog
        open={editOpen}
        title={`Edit ${title} Record`}
        fields={crudFields}
        loading={loading}
        initialValues={
          selected
            ? {
                name: selected.name,
                reference: selected.reference,
                status: selected.status,
                notes: selected.notes
              }
            : undefined
        }
        onClose={() => {
          setEditOpen(false);
          setSelected(null);
        }}
        onSubmit={(values) => void editRecord(values)}
      />
      <ConfirmDeleteDialog
        open={deleteOpen}
        title={`Delete ${title} record?`}
        description={selected ? `This will remove "${selected.name}" permanently.` : 'This record will be removed permanently.'}
        loading={loading}
        onCancel={() => {
          setDeleteOpen(false);
          setSelected(null);
        }}
        onConfirm={() => void removeRecord()}
      />
    </Stack>
  );
};
