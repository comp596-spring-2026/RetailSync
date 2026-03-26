import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import Collapse from '@mui/material/Collapse';
import Divider from '@mui/material/Divider';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';
import { useEffect, useMemo, useState } from 'react';
import { QuickBooksLogo } from '../../../../components';
import {
  buildQuickBooksViewModel,
} from './buildQuickBooksViewModel';
import { QuickBooksActionStack } from './QuickBooksActionStack';
import { QuickBooksConnectorRow } from './QuickBooksConnectorRow';
import type { QuickBooksSettings } from '@retailsync/shared';
import type { QuickBooksOAuthStatusInput } from '../../types/quickbooks';

type Props = {
  settings: QuickBooksSettings | null;
  oauthStatus?: QuickBooksOAuthStatusInput;
  canManageConnection: boolean;
  canSync: boolean;
  canRefreshStatus: boolean;
  busy: boolean;
  loading?: boolean;
  canViewHealth?: boolean;
  onConnect: () => Promise<void> | void;
  onDisconnect: () => Promise<void> | void;
  onRefreshReferences: () => Promise<void> | void;
  onPostApproved: () => Promise<void> | void;
  onRefreshStatus: () => Promise<void> | void;
  detailAction?: {
    label: string;
    to: string;
  };
  initialExpanded?: boolean;
};

const toChipColor = (tone: 'default' | 'info' | 'success' | 'warning' | 'error') => {
  switch (tone) {
    case 'info':
      return 'info' as const;
    case 'success':
      return 'success' as const;
    case 'warning':
      return 'warning' as const;
    case 'error':
      return 'error' as const;
    default:
      return 'default' as const;
  }
};

const toToneColor = (tone: 'default' | 'info' | 'success' | 'warning' | 'error') => {
  switch (tone) {
    case 'info':
      return 'info.main';
    case 'success':
      return 'success.main';
    case 'warning':
      return 'warning.main';
    case 'error':
      return 'error.main';
    default:
      return 'text.primary';
  }
};

export const QuickBooksIntegrationCard = ({
  settings,
  oauthStatus = null,
  canManageConnection,
  canSync,
  canRefreshStatus,
  busy,
  loading = false,
  canViewHealth = true,
  onConnect,
  onDisconnect,
  onRefreshReferences,
  onPostApproved,
  onRefreshStatus,
  detailAction,
  initialExpanded = false,
}: Props) => {
  const [expanded, setExpanded] = useState(initialExpanded);

  useEffect(() => {
    setExpanded(initialExpanded);
  }, [initialExpanded]);

  const viewModel = useMemo(
    () =>
      buildQuickBooksViewModel({
        settings,
        oauthStatus,
        loading,
        canViewHealth,
      }),
    [settings, oauthStatus, loading, canViewHealth],
  );

  return (
    <Card>
      <CardContent>
        <Stack spacing={2}>
          <Stack spacing={0.5}>
            <Stack direction="row" spacing={1} alignItems="center">
              <QuickBooksLogo height={24} />
            </Stack>
            <Typography variant="body2" color="text.secondary">
              Status: {viewModel.statusLabel}
            </Typography>
          </Stack>

          <Divider />

          <Typography variant="body2" color="text.secondary">
            {viewModel.summaryText}
          </Typography>

          <Typography variant="subtitle2" color="text.secondary">
            Company integration setup
          </Typography>

          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ bgcolor: 'action.hover' }}>
                  <TableCell sx={{ fontWeight: 600 }}>Connector</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Status</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Source</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Info</TableCell>
                  <TableCell sx={{ fontWeight: 600 }} align="right">
                    Actions
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                <QuickBooksConnectorRow
                  viewModel={viewModel}
                  expanded={expanded}
                  onToggle={() => setExpanded((current) => !current)}
                />
                <TableRow sx={{ bgcolor: expanded ? 'action.hover' : undefined }}>
                  <TableCell
                    colSpan={5}
                    sx={{
                      p: 0,
                      borderBottom: expanded ? 1 : 0,
                      borderColor: 'divider',
                    }}
                  >
                    <Collapse in={expanded} timeout="auto" unmountOnExit>
                      <Box
                        sx={{
                          px: 2,
                          py: 1.75,
                          borderTop: 1,
                          borderColor: 'divider',
                          bgcolor: 'action.hover',
                        }}
                      >
                        <Stack spacing={2}>
                          {viewModel.showSandboxWarning ? (
                            <Alert severity="warning">
                              Sandbox mode is active. Use development credentials and a sandbox QuickBooks company here.
                            </Alert>
                          ) : null}

                          {viewModel.connectionNotice ? (
                            <Alert severity={viewModel.connectionNotice.severity}>
                              {viewModel.connectionNotice.message}
                            </Alert>
                          ) : null}

                          <Box
                            sx={{
                              display: 'grid',
                              gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 7fr) minmax(0, 3fr)' },
                              gap: 1.5,
                              alignItems: 'start',
                            }}
                          >
                            <Stack spacing={1.25}>
                              <Paper variant="outlined" sx={{ p: 1.25 }}>
                                <Stack spacing={0.5}>
                                  <Typography variant="subtitle2">Connection details</Typography>
                                  {viewModel.connectionDetails.map((detail) => (
                                    <Stack
                                      key={detail.label}
                                      direction="row"
                                      justifyContent="space-between"
                                      spacing={2}
                                    >
                                      <Typography variant="caption" color="text.secondary">
                                        {detail.label}
                                      </Typography>
                                      <Typography
                                        variant="caption"
                                        sx={{
                                          fontWeight: 700,
                                          color: toToneColor(detail.tone ?? 'default'),
                                          textAlign: 'right',
                                        }}
                                      >
                                        {detail.value}
                                      </Typography>
                                    </Stack>
                                  ))}
                                </Stack>
                              </Paper>

                              <Paper variant="outlined" sx={{ p: 1.25 }}>
                                <Stack spacing={1}>
                                  <Stack
                                    direction={{ xs: 'column', sm: 'row' }}
                                    justifyContent="space-between"
                                    spacing={1}
                                    alignItems={{ sm: 'center' }}
                                  >
                                    <Typography variant="subtitle2">OAuth / token health</Typography>
                                    <Chip
                                      size="small"
                                      label={viewModel.tokenHealth.label}
                                      color={toChipColor(viewModel.tokenHealth.tone)}
                                      variant={
                                        viewModel.tokenHealth.tone === 'default' ? 'outlined' : 'filled'
                                      }
                                    />
                                  </Stack>
                                  <Typography variant="body2" color="text.secondary">
                                    {viewModel.tokenHealth.message}
                                  </Typography>
                                  {viewModel.tokenHealth.details.map((detail) => (
                                    <Stack
                                      key={detail.label}
                                      direction="row"
                                      justifyContent="space-between"
                                      spacing={2}
                                    >
                                      <Typography variant="caption" color="text.secondary">
                                        {detail.label}
                                      </Typography>
                                      <Typography
                                        variant="caption"
                                        sx={{
                                          fontWeight: 700,
                                          textAlign: 'right',
                                          color: toToneColor(detail.tone ?? 'default'),
                                        }}
                                      >
                                        {detail.value}
                                      </Typography>
                                    </Stack>
                                  ))}
                                </Stack>
                              </Paper>

                              <Paper variant="outlined" sx={{ p: 1.25 }}>
                                <Stack spacing={1.25}>
                                  <Typography variant="subtitle2">Sync summary</Typography>
                                  {viewModel.syncSummaries.map((summary, index) => (
                                    <Stack key={summary.key} spacing={0.75}>
                                      {index > 0 ? <Divider /> : null}
                                      <Stack
                                        direction={{ xs: 'column', sm: 'row' }}
                                        justifyContent="space-between"
                                        spacing={1}
                                        alignItems={{ sm: 'center' }}
                                      >
                                        <Stack spacing={0.25}>
                                          <Typography variant="body2" sx={{ fontWeight: 700 }}>
                                            {summary.title}
                                          </Typography>
                                          <Typography variant="caption" color="text.secondary">
                                            {summary.subtitle}
                                          </Typography>
                                        </Stack>
                                        <Chip
                                          size="small"
                                          label={summary.statusLabel}
                                          color={toChipColor(summary.statusTone)}
                                          variant={summary.statusTone === 'default' ? 'outlined' : 'filled'}
                                        />
                                      </Stack>
                                      <Typography variant="caption" color="text.secondary">
                                        Last run: {summary.lastRunLabel}
                                      </Typography>
                                      <Typography variant="caption" color="text.secondary">
                                        {summary.countLabel}: {summary.count.toLocaleString()}
                                      </Typography>
                                      <Typography
                                        variant="caption"
                                        color={summary.error ? 'error.main' : 'text.secondary'}
                                        sx={{ wordBreak: 'break-word' }}
                                      >
                                        {summary.detail}
                                      </Typography>
                                    </Stack>
                                  ))}
                                </Stack>
                              </Paper>
                            </Stack>

                            <QuickBooksActionStack
                              viewModel={viewModel}
                              canManageConnection={canManageConnection}
                              canSync={canSync}
                              canRefreshStatus={canRefreshStatus}
                              busy={busy}
                              loading={loading}
                              onConnect={onConnect}
                              onDisconnect={onDisconnect}
                              onRefreshReferences={onRefreshReferences}
                              onPostApproved={onPostApproved}
                              onRefreshStatus={onRefreshStatus}
                              detailAction={detailAction}
                            />
                          </Box>
                        </Stack>
                      </Box>
                    </Collapse>
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </TableContainer>
        </Stack>
      </CardContent>
    </Card>
  );
};
