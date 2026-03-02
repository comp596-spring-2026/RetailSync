import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Collapse,
  Divider,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  LinearProgress,
  MenuItem,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import GoogleIcon from "@mui/icons-material/Google";
import ShareIcon from "@mui/icons-material/Share";
import SyncAltIcon from "@mui/icons-material/SyncAlt";
import LinkIcon from "@mui/icons-material/Link";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import SettingsIcon from "@mui/icons-material/Settings";
import { Fragment, useEffect, useMemo, useState } from "react";
import type { GoogleSheetMode } from '../../api';
import { GoogleSheetsSetupInline } from "./GoogleSheetsSetupInline";

export type GoogleSheetsSettings = {
  mode: GoogleSheetMode;
  serviceAccountEmail: string;
  connected: boolean;
  connectedEmail: string | null;
  syncSchedule?: {
    enabled: boolean;
    hour: number;
    minute: number;
    timezone: string;
  };
  lastScheduledSyncAt?: string | null;
  sources: Array<{
    sourceId: string;
    name: string;
    spreadsheetTitle?: string | null;
    spreadsheetId: string;
    sheetGid: string | null;
    range: string;
    mapping: Record<string, string>;
    transformations?: Record<string, unknown>;
    active: boolean;
  }>;
  sharedConfig?: {
    spreadsheetId: string | null;
    spreadsheetTitle?: string | null;
    sheetName: string;
    headerRow: number;
    enabled: boolean;
    columnsMap?: Record<string, string>;
    shareStatus?: "unknown" | "not_shared" | "shared" | "no_permission" | "not_found";
    lastVerifiedAt?: string | null;
    lastImportAt?: string | null;
    availableTabs?: Array<{ sheetId: number; sheetName: string }>;
    lastMapping?: {
      columnsMap?: Record<string, string>;
      createdAt?: string | null;
      createdBy?: string | null;
    } | null;
  };
  sharedSheets?: Array<{
    profileId: string;
    name: string;
    spreadsheetId: string | null;
    spreadsheetTitle?: string | null;
    sheetName: string;
    headerRow: number;
    enabled: boolean;
    isDefault?: boolean;
    shareStatus?: "unknown" | "not_shared" | "shared" | "no_permission" | "not_found";
    lastVerifiedAt?: string | null;
    lastImportAt?: string | null;
    columnsMap?: Record<string, string>;
    lastMapping?: {
      columnsMap?: Record<string, string>;
      transformations?: Record<string, unknown>;
      createdAt?: string | null;
      createdBy?: string | null;
    } | null;
  }>;
};

export type GoogleSheetsSyncOverview = {
  totalEntries: number;
  lastUpdatedAt: string | null;
  byProfile: Array<{
    profileName: string;
    entries: number;
    lastUpdatedAt: string | null;
  }>;
};

type Props = {
  settings: GoogleSheetsSettings;
  syncOverview?: GoogleSheetsSyncOverview | null;
  syncProgress?: { percent: number; stage: string } | null;
  canEdit: boolean;
  isBusy: boolean;
  oauthStatus?: "ok" | "error" | null;
  onCheckOAuthStatus?: () => Promise<void> | void;
  onToggleUpdateDbWithSheet?: (enabled: boolean) => Promise<void> | void;
  onOpenWizard?: () => void;
  onReset: () => void;
  onVerifyShared: () => Promise<void> | void;
  onSaveShared: () => Promise<void> | void;
  onSetActiveMode: (mode: GoogleSheetMode) => Promise<void> | void;
  onSettingsRefetch?: () => Promise<void> | void;
  onSyncNow?: () => Promise<void> | void;
  onSaveSyncSchedule?: (payload: { enabled: boolean; hour: number; minute: number; timezone: string }) => Promise<void> | void;
  onDeleteSource?: (payload: {
    mode: GoogleSheetMode;
    profileName: ProfileName;
    deleteType: "soft" | "hard";
    confirmText: string;
  }) => Promise<void> | void;
  onDebug?: (mode: "oauth" | "shared") => void;
  initialExpandConfigureSection?: boolean;
  onConsumedExpandConfigure?: () => void;
};

type ProfileName = "POS DATA SHEET";
const PROFILE_ROWS: ProfileName[] = ["POS DATA SHEET"];
const DEFAULT_SYNC_UTC_OFFSET = "UTC-08:00";

const UTC_OFFSET_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "UTC-12:00", label: "UTC-12:00 · Baker Island" },
  { value: "UTC-11:00", label: "UTC-11:00 · Pago Pago" },
  { value: "UTC-10:00", label: "UTC-10:00 · Honolulu" },
  { value: "UTC-09:30", label: "UTC-09:30 · Marquesas" },
  { value: "UTC-09:00", label: "UTC-09:00 · Anchorage" },
  { value: "UTC-08:00", label: "UTC-08:00 · Los Angeles" },
  { value: "UTC-07:00", label: "UTC-07:00 · Phoenix" },
  { value: "UTC-06:00", label: "UTC-06:00 · Mexico City" },
  { value: "UTC-05:00", label: "UTC-05:00 · New York" },
  { value: "UTC-04:00", label: "UTC-04:00 · Santiago" },
  { value: "UTC-03:30", label: "UTC-03:30 · St. John's" },
  { value: "UTC-03:00", label: "UTC-03:00 · Buenos Aires" },
  { value: "UTC-02:00", label: "UTC-02:00 · South Georgia" },
  { value: "UTC-01:00", label: "UTC-01:00 · Azores" },
  { value: "UTC+00:00", label: "UTC+00:00 · London" },
  { value: "UTC+01:00", label: "UTC+01:00 · Berlin" },
  { value: "UTC+02:00", label: "UTC+02:00 · Cairo" },
  { value: "UTC+03:00", label: "UTC+03:00 · Riyadh" },
  { value: "UTC+03:30", label: "UTC+03:30 · Tehran" },
  { value: "UTC+04:00", label: "UTC+04:00 · Dubai" },
  { value: "UTC+04:30", label: "UTC+04:30 · Kabul" },
  { value: "UTC+05:00", label: "UTC+05:00 · Karachi" },
  { value: "UTC+05:30", label: "UTC+05:30 · Mumbai" },
  { value: "UTC+05:45", label: "UTC+05:45 · Kathmandu" },
  { value: "UTC+06:00", label: "UTC+06:00 · Dhaka" },
  { value: "UTC+06:30", label: "UTC+06:30 · Yangon" },
  { value: "UTC+07:00", label: "UTC+07:00 · Bangkok" },
  { value: "UTC+08:00", label: "UTC+08:00 · Singapore" },
  { value: "UTC+08:45", label: "UTC+08:45 · Eucla" },
  { value: "UTC+09:00", label: "UTC+09:00 · Tokyo" },
  { value: "UTC+09:30", label: "UTC+09:30 · Adelaide" },
  { value: "UTC+10:00", label: "UTC+10:00 · Sydney" },
  { value: "UTC+10:30", label: "UTC+10:30 · Lord Howe" },
  { value: "UTC+11:00", label: "UTC+11:00 · Noumea" },
  { value: "UTC+12:00", label: "UTC+12:00 · Auckland" },
  { value: "UTC+12:45", label: "UTC+12:45 · Chatham" },
  { value: "UTC+13:00", label: "UTC+13:00 · Nuku'alofa" },
  { value: "UTC+13:45", label: "UTC+13:45 · Chatham DST" },
  { value: "UTC+14:00", label: "UTC+14:00 · Kiritimati" },
];

const normalizeName = (value: string) => value.trim().toUpperCase();
const toUtcOffset = (value: string | null | undefined) =>
  UTC_OFFSET_OPTIONS.some((option) => option.value === value) ? value ?? DEFAULT_SYNC_UTC_OFFSET : DEFAULT_SYNC_UTC_OFFSET;

export const GoogleSheetsIntegrationCard = ({
  settings,
  syncOverview = null,
  syncProgress = null,
  canEdit,
  isBusy,
  oauthStatus = null,
  onCheckOAuthStatus,
  onSetActiveMode,
  onReset,
  onSettingsRefetch,
  onSyncNow,
  onSaveSyncSchedule,
  onDeleteSource,
  onDebug,
  initialExpandConfigureSection = false,
  onConsumedExpandConfigure,
}: Props) => {
  void onCheckOAuthStatus;
  void onSetActiveMode;

  const shared = settings.sharedConfig;
  const sharedSheets = settings.sharedSheets ?? [];
  const [expanded, setExpanded] = useState<ProfileName | null>("POS DATA SHEET");
  const [modeByProfile, setModeByProfile] = useState<Record<ProfileName, GoogleSheetMode>>({
    "POS DATA SHEET": settings.mode,
  });
  const [syncSchedule, setSyncSchedule] = useState({
    enabled: settings.syncSchedule?.enabled ?? false,
    hour: settings.syncSchedule?.hour ?? 2,
    minute: settings.syncSchedule?.minute ?? 0,
    timezone: toUtcOffset(settings.syncSchedule?.timezone),
  });
  const [scheduleDialogOpen, setScheduleDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ mode: GoogleSheetMode; profileName: ProfileName } | null>(null);
  const [deleteType, setDeleteType] = useState<"soft" | "hard">("soft");
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const hasConnectedSheet = useMemo(() => {
    const hasOauth = settings.sources.some((source) => Boolean(source.spreadsheetId));
    const hasSharedProfiles = (settings.sharedSheets ?? []).some(
      (sheet) => Boolean(sheet.spreadsheetId) && Boolean(sheet.enabled),
    );
    const hasLegacyShared = Boolean(settings.sharedConfig?.spreadsheetId) && Boolean(settings.sharedConfig?.enabled);
    return hasOauth || hasSharedProfiles || hasLegacyShared;
  }, [settings.sharedConfig?.enabled, settings.sharedConfig?.spreadsheetId, settings.sharedSheets, settings.sources]);

  const inferModeForProfile = (profileName: ProfileName): GoogleSheetMode => {
    const oauthSource = settings.sources.find((source) => normalizeName(source.name) === profileName);
    const sharedProfile = sharedSheets.find((sheet) => normalizeName(sheet.name) === profileName);
    const hasOAuth = Boolean(oauthSource?.spreadsheetId);
    const hasShared = Boolean(sharedProfile?.spreadsheetId);

    if (hasOAuth && !hasShared) return "oauth";
    if (hasShared && !hasOAuth) return "service_account";
    if (hasOAuth && hasShared) return settings.mode;
    return settings.mode;
  };

  useEffect(() => {
    setModeByProfile({
      "POS DATA SHEET": inferModeForProfile("POS DATA SHEET"),
    });
  }, [settings.mode, settings.sources, sharedSheets.length]);

  useEffect(() => {
    if (initialExpandConfigureSection) {
      setExpanded("POS DATA SHEET");
      onConsumedExpandConfigure?.();
    }
  }, [initialExpandConfigureSection, onConsumedExpandConfigure]);

  useEffect(() => {
    setSyncSchedule({
      enabled: settings.syncSchedule?.enabled ?? false,
      hour: settings.syncSchedule?.hour ?? 2,
      minute: settings.syncSchedule?.minute ?? 0,
      timezone: toUtcOffset(settings.syncSchedule?.timezone),
    });
  }, [settings.syncSchedule?.enabled, settings.syncSchedule?.hour, settings.syncSchedule?.minute, settings.syncSchedule?.timezone]);

  const globalStatusLabel =
    settings.mode === "oauth"
      ? settings.connected
        ? oauthStatus === "ok"
          ? "Connected · Working"
          : oauthStatus === "error"
            ? "Re-authorization needed"
            : "OAuth connected"
        : "Use Shared source"
      : shared?.enabled
        ? "Shared sync enabled"
        : "Not configured";

  const globalStatusColor: "success" | "warning" | "default" =
    settings.mode === "oauth"
      ? settings.connected
        ? oauthStatus === "ok"
          ? "success"
          : oauthStatus === "error"
            ? "warning"
            : "default"
        : "default"
      : shared?.enabled
        ? "success"
        : "default";

  const rows = useMemo(
    () =>
      PROFILE_ROWS.map((profileName) => {
        const selectedMode = modeByProfile[profileName] ?? settings.mode;
        const oauthSource = settings.sources.find((source) => normalizeName(source.name) === profileName);
        const sharedProfile = sharedSheets.find((sheet) => normalizeName(sheet.name) === profileName);
        const spreadsheetId =
          selectedMode === "oauth"
            ? oauthSource?.spreadsheetId ?? ""
            : sharedProfile?.spreadsheetId ?? "";
        const spreadsheetTitle =
          selectedMode === "oauth"
            ? oauthSource?.spreadsheetTitle ?? oauthSource?.name ?? null
            : sharedProfile?.spreadsheetTitle ?? sharedProfile?.name ?? null;
        const mappedCount =
          selectedMode === "oauth"
            ? Object.keys(oauthSource?.mapping ?? {}).length
            : Object.keys(sharedProfile?.columnsMap ?? sharedProfile?.lastMapping?.columnsMap ?? {}).length;
        const configured = Boolean(spreadsheetId);
        const completed = configured && mappedCount > 0;
        const statusText = completed ? "Completed" : configured ? "Configured" : "Not configured";
        const sourceText = completed ? (selectedMode === "oauth" ? "OAuth" : "Shared") : "—";
        const infoText = spreadsheetId
          ? `${spreadsheetTitle ?? "Sheet"} (${spreadsheetId.slice(0, 12)}...)`
          : "No spreadsheet selected yet";

        return {
          profileName,
          selectedMode,
          statusText,
          sourceText,
          infoText,
          mappedCount,
        };
      }),
    [modeByProfile, settings.mode, settings.sources, sharedSheets],
  );

  const onChangeProfileMode = (profileName: ProfileName, nextMode: GoogleSheetMode) => {
    setModeByProfile((prev) => ({ ...prev, [profileName]: nextMode }));
  };

  const toggleExpanded = (profileName: ProfileName) => {
    setExpanded((prev) => (prev === profileName ? null : profileName));
  };
  const scheduleTimeValue = `${String(syncSchedule.hour).padStart(2, "0")}:${String(syncSchedule.minute).padStart(2, "0")}`;
  const handleSaveSchedule = async () => {
    await onSaveSyncSchedule?.({
      enabled: syncSchedule.enabled,
      hour: syncSchedule.hour,
      minute: syncSchedule.minute,
      timezone: syncSchedule.timezone,
    });
    setScheduleDialogOpen(false);
  };
  const expectedDeleteText = deleteType === "hard" ? "HARD RESET" : "SOFT RESET";
  const canSubmitDelete = Boolean(deleteTarget) && deleteConfirmText.trim().toUpperCase() === expectedDeleteText;

  const handleOpenDeleteDialog = (row: { selectedMode: GoogleSheetMode; profileName: ProfileName }) => {
    setDeleteTarget({ mode: row.selectedMode, profileName: row.profileName });
    setDeleteType("soft");
    setDeleteConfirmText("");
    setDeleteDialogOpen(true);
  };

  const handleSubmitDelete = async () => {
    if (!deleteTarget) return;
    await onDeleteSource?.({
      mode: deleteTarget.mode,
      profileName: deleteTarget.profileName,
      deleteType,
      confirmText: deleteConfirmText.trim(),
    });
    setDeleteDialogOpen(false);
    setDeleteTarget(null);
    setDeleteConfirmText("");
  };

  return (
    <Card>
      <CardContent>
        <Stack spacing={2}>
          <Stack direction="row" justifyContent="space-between" alignItems="center">
            <Stack direction="row" spacing={1} alignItems="center">
              <Box component="img" src="/google-sheets-icon.svg" alt="Google Sheets" sx={{ width: 24, height: 24 }} />
              <Typography variant="h6">Google Sheets</Typography>
              <Chip size="small" label={globalStatusLabel} color={globalStatusColor} variant="filled" />
            </Stack>
            <Stack direction="row" spacing={1}>
              <Button
                size="small"
                variant="outlined"
                startIcon={<SyncAltIcon />}
                disabled={!hasConnectedSheet || isBusy || !canEdit}
                onClick={() => {
                  if (!onSyncNow) return;
                  const shouldSync = window.confirm(
                    "This will pull the latest sheet data and upsert POS rows. Continue?",
                  );
                  if (!shouldSync) return;
                  void onSyncNow();
                }}
              >
                Sync now
              </Button>
              <Button
                size="small"
                variant="outlined"
                startIcon={<LinkIcon />}
                color="error"
                disabled={isBusy || !canEdit}
                onClick={onReset}
              >
                Reset integration
              </Button>
            </Stack>
          </Stack>

          <Divider />

          {(syncOverview || syncProgress) && (
            <Stack spacing={1} sx={{ p: 1.25, border: "1px solid", borderColor: "divider", borderRadius: 1 }}>
              {syncProgress ? (
                <Stack spacing={0.75}>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    {syncProgress.stage}
                  </Typography>
                  <LinearProgress variant="determinate" value={syncProgress.percent} />
                </Stack>
              ) : null}

              {syncOverview ? (
                <>
                  <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
                    <Chip size="small" variant="outlined" label={`Sheet entries: ${syncOverview.totalEntries}`} />
                    <Chip
                      size="small"
                      variant="outlined"
                      label={`Last updated: ${
                        syncOverview.lastUpdatedAt
                          ? new Date(syncOverview.lastUpdatedAt).toLocaleString()
                          : "—"
                      }`}
                    />
                  </Stack>
                  {syncOverview.byProfile.length > 0 ? (
                    <Stack direction="row" spacing={1} flexWrap="wrap">
                      {syncOverview.byProfile.map((entry) => (
                        <Chip
                          key={entry.profileName}
                          size="small"
                          variant="outlined"
                          label={`${entry.profileName}: ${entry.entries}`}
                        />
                      ))}
                    </Stack>
                  ) : null}
                </>
              ) : null}
            </Stack>
          )}

          <Typography variant="subtitle2" color="text.secondary">
            Sheet-wise integration setup
          </Typography>

          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ bgcolor: "action.hover" }}>
                  <TableCell sx={{ fontWeight: 600 }}>Sheet</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Status</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Source</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Info</TableCell>
                  <TableCell sx={{ fontWeight: 600 }} align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map((row) => {
                  const isOpen = expanded === row.profileName;
                  return (
                    <Fragment key={row.profileName}>
                      <TableRow hover>
                        <TableCell>
                          <Stack spacing={0.25}>
                            <Typography variant="body2" fontWeight={700}>{row.profileName}</Typography>
                            <Typography variant="caption" color="text.secondary">{row.mappedCount} mapped</Typography>
                          </Stack>
                        </TableCell>
                        <TableCell>{row.statusText}</TableCell>
                        <TableCell sx={{ color: row.sourceText === "—" ? "text.disabled" : "text.primary" }}>
                          {row.sourceText}
                        </TableCell>
                        <TableCell>
                          <Typography variant="caption" color="text.secondary" noWrap>{row.infoText}</Typography>
                        </TableCell>
                        <TableCell align="right">
                          <Button
                            size="small"
                            variant="text"
                            onClick={() => toggleExpanded(row.profileName)}
                            disabled={isBusy || !canEdit}
                            startIcon={<SettingsIcon fontSize="small" />}
                            endIcon={
                              <ExpandMoreIcon
                                sx={{
                                  color: "text.secondary",
                                  transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
                                  transition: "transform 0.2s",
                                }}
                              />
                            }
                            sx={{ border: "none", boxShadow: "none", textTransform: "none" }}
                          >
                            Configure
                          </Button>
                        </TableCell>
                      </TableRow>

                      <TableRow sx={{ bgcolor: isOpen ? "action.hover" : undefined }}>
                        <TableCell
                          colSpan={5}
                          sx={{
                            p: 0,
                            borderBottom: isOpen ? 1 : 0,
                            borderColor: "divider",
                          }}
                        >
                          <Collapse in={isOpen} timeout="auto" unmountOnExit>
                            <Box sx={{ px: 2, py: 1.75, borderTop: 1, borderColor: "divider", bgcolor: "action.hover" }}>
                              <Stack spacing={2}>
                              <Stack
                                direction={{ xs: "column", md: "row" }}
                                spacing={1.5}
                                justifyContent="space-between"
                                alignItems={{ xs: "flex-start", md: "center" }}
                              >
                                <Stack spacing={0.5}>
                                  <Typography variant="subtitle2">How this sheet syncs</Typography>
                                  <Typography variant="caption" color="text.secondary">
                                    Choose sync source, then select sheet/tab and save mapping.
                                  </Typography>
                                </Stack>

                                <ToggleButtonGroup
                                  size="small"
                                  exclusive
                                  value={row.selectedMode}
                                  onChange={(_e, value: GoogleSheetMode | null) => {
                                    if (!value || isBusy || !canEdit) return;
                                    onChangeProfileMode(row.profileName, value);
                                  }}
                                >
                                  <ToggleButton value="oauth">
                                    <Stack direction="row" spacing={0.5} alignItems="center">
                                      <GoogleIcon fontSize="small" />
                                      <span>OAuth</span>
                                    </Stack>
                                  </ToggleButton>
                                  <ToggleButton value="service_account">
                                    <Stack direction="row" spacing={0.5} alignItems="center">
                                      <ShareIcon fontSize="small" />
                                      <span>Shared</span>
                                    </Stack>
                                  </ToggleButton>
                                </ToggleButtonGroup>
                              </Stack>

                              <GoogleSheetsSetupInline
                                mode={row.selectedMode === "oauth" ? "oauth" : "service_account"}
                                settings={settings}
                                canEdit={canEdit}
                                isBusy={isBusy}
                                lockedProfileName={row.profileName}
                                onOpenSyncSetup={() => setScheduleDialogOpen(true)}
                                onDebug={onDebug}
                                onRequestDeleteSource={({ mode, profileName }) =>
                                  handleOpenDeleteDialog({
                                    selectedMode: mode,
                                    profileName,
                                  })
                                }
                                onSaved={async () => await onSettingsRefetch?.()}
                              />
                              </Stack>
                            </Box>
                          </Collapse>
                        </TableCell>
                      </TableRow>
                    </Fragment>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        </Stack>
      </CardContent>
      <Dialog open={scheduleDialogOpen} onClose={() => setScheduleDialogOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Sync new sheet data</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2} sx={{ pt: 0.5 }}>
            <FormControlLabel
              control={
                <Switch
                  checked={syncSchedule.enabled}
                  onChange={(_e, checked) => setSyncSchedule((prev) => ({ ...prev, enabled: checked }))}
                  disabled={isBusy || !canEdit}
                />
              }
              label="Auto-sync new sheet data"
            />

            <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
              <TextField
                label="Daily sync time"
                size="small"
                type="time"
                value={scheduleTimeValue}
                onChange={(e) => {
                  const [hh, mm] = String(e.target.value || "00:00").split(":");
                  setSyncSchedule((prev) => ({
                    ...prev,
                    hour: Number(hh ?? 0),
                    minute: Number(mm ?? 0),
                  }));
                }}
                InputLabelProps={{ shrink: true }}
                inputProps={{ step: 60 }}
                disabled={isBusy || !canEdit}
              />
              <TextField
                select
                label="Time zone (UTC offset)"
                size="small"
                value={syncSchedule.timezone}
                onChange={(e) => setSyncSchedule((prev) => ({ ...prev, timezone: e.target.value }))}
                disabled={isBusy || !canEdit}
                sx={{ minWidth: 260 }}
              >
                {UTC_OFFSET_OPTIONS.map((option) => (
                  <MenuItem key={option.value} value={option.value}>
                    {option.label}
                  </MenuItem>
                ))}
              </TextField>
            </Stack>

            <Typography variant="caption" color="text.secondary">
              New sheet data syncs once per day at your selected time and UTC offset.
            </Typography>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setScheduleDialogOpen(false)} disabled={isBusy}>
            Cancel
          </Button>
          <Button variant="contained" onClick={() => void handleSaveSchedule()} disabled={isBusy || !canEdit}>
            Save sync settings
          </Button>
        </DialogActions>
      </Dialog>
      <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Reset Google Sheets integration</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2} sx={{ pt: 0.5 }}>
            <Typography variant="body2" color="text.secondary">
              Soft reset removes OAuth connection and all Google Sheets configuration for this company. Existing imported data remains in the database.
            </Typography>
            <ToggleButtonGroup
              exclusive
              value={deleteType}
              onChange={(_e, value: "soft" | "hard" | null) => {
                if (!value) return;
                setDeleteType(value);
                setDeleteConfirmText("");
              }}
              size="small"
            >
              <ToggleButton value="soft">Soft reset</ToggleButton>
              <ToggleButton value="hard">Hard reset</ToggleButton>
            </ToggleButtonGroup>
            <Alert severity={deleteType === "hard" ? "warning" : "info"}>
              {deleteType === "hard"
                ? "Hard reset removes OAuth connection, all Google Sheets configuration, and deletes all Google Sheets imported POS rows."
                : "Soft reset removes OAuth connection and all Google Sheets configuration, but keeps existing imported rows."}
            </Alert>
            <TextField
              size="small"
              label={`Type ${expectedDeleteText} to confirm`}
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)} disabled={isBusy}>
            Cancel
          </Button>
          <Button
            variant="contained"
            color="error"
            disabled={!canSubmitDelete || isBusy || !canEdit}
            onClick={() => void handleSubmitDelete()}
          >
            Confirm reset
          </Button>
        </DialogActions>
      </Dialog>
    </Card>
  );
};
