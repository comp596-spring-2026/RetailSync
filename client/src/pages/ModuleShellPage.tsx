import { Box, Button, Paper, Stack, Typography } from '@mui/material';
import BuildCircleIcon from '@mui/icons-material/BuildCircle';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import { ModuleKey } from '@retailsync/shared';
import { PermissionGate } from '../components/PermissionGate';
import { NoAccess } from '../components/NoAccess';
import { moduleActionsMap } from '../constants/modules';
import { useAppSelector } from '../app/hooks';
import { hasPermission } from '../utils/permissions';
import { PageHeader } from '../components/PageHeader';

type ModuleShellProps = {
  module: ModuleKey;
};

export const ModuleShellPage = ({ module }: ModuleShellProps) => {
  const permissions = useAppSelector((state) => state.auth.permissions);
  const canView = hasPermission(permissions, module, 'view');

  if (!canView) {
    return <NoAccess />;
  }

  const title = module.charAt(0).toUpperCase() + module.slice(1);

  return (
    <Paper sx={{ p: 3 }}>
      <PageHeader title={title} subtitle="RBAC-aware module shell and action controls" icon={<BuildCircleIcon />} />
      <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}>
        <PermissionGate module={module} action="create">
          <Button variant="contained" startIcon={<AddCircleOutlineIcon />}>
            Create
          </Button>
        </PermissionGate>
        <PermissionGate module={module} action="edit">
          <Button variant="contained" color="warning" startIcon={<EditOutlinedIcon />}>
            Edit
          </Button>
        </PermissionGate>
        <PermissionGate module={module} action="delete">
          <Button variant="contained" color="error" startIcon={<DeleteOutlineIcon />}>
            Delete
          </Button>
        </PermissionGate>
        {moduleActionsMap[module].map((custom) => (
          <PermissionGate key={custom} module={module} action={`actions:${custom}`}>
            <Button variant="outlined">{custom}</Button>
          </PermissionGate>
        ))}
      </Stack>
      <Box sx={{ mt: 2 }}>
        <Typography variant="caption">API integration for this module can be added next.</Typography>
      </Box>
    </Paper>
  );
};
