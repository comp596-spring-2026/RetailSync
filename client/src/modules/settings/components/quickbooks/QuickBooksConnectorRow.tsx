import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import SettingsIcon from '@mui/icons-material/Settings';
import {
  Button,
  Stack,
  TableCell,
  TableRow,
  Typography,
} from '@mui/material';
import type { QuickBooksIntegrationViewModel } from './buildQuickBooksViewModel';

type Props = {
  viewModel: QuickBooksIntegrationViewModel;
  expanded: boolean;
  onToggle: () => void;
};

const toneColor = (tone: QuickBooksIntegrationViewModel['statusTone']) => {
  switch (tone) {
    case 'success':
      return 'success.main';
    case 'warning':
      return 'warning.main';
    case 'error':
      return 'error.main';
    case 'info':
      return 'info.main';
    default:
      return 'text.primary';
  }
};

export const QuickBooksConnectorRow = ({
  viewModel,
  expanded,
  onToggle,
}: Props) => {
  return (
    <TableRow hover>
      <TableCell>
        <Stack spacing={0.25}>
          <Typography variant="body2" fontWeight={700}>
            {viewModel.connectorLabel}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {viewModel.connectorCaption}
          </Typography>
        </Stack>
      </TableCell>
      <TableCell>
        <Typography
          variant="body2"
          sx={{ fontWeight: 600, color: toneColor(viewModel.statusTone) }}
        >
          {viewModel.statusLabel}
        </Typography>
      </TableCell>
      <TableCell>{viewModel.sourceLabel}</TableCell>
      <TableCell>
        <Typography variant="caption" color="text.secondary" noWrap>
          {viewModel.infoLabel}
        </Typography>
      </TableCell>
      <TableCell align="right">
        <Button
          size="small"
          variant="text"
          onClick={onToggle}
          startIcon={<SettingsIcon fontSize="small" />}
          endIcon={
            <ExpandMoreIcon
              sx={{
                color: 'text.secondary',
                transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
                transition: 'transform 0.2s',
              }}
            />
          }
          sx={{ border: 'none', boxShadow: 'none', textTransform: 'none' }}
        >
          {viewModel.rowActionLabel}
        </Button>
      </TableCell>
    </TableRow>
  );
};
