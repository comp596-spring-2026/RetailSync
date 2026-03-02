import {
  Box,
  Button,
  Chip,
  Divider,
  Grid,
  IconButton,
  Stack,
  Switch,
  Tooltip,
  Typography,
} from "@mui/material";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import { GoogleSheetsSettings } from "./GoogleSheetsIntegrationCard";
import type { GoogleSheetMode } from '../../api';

type Props = {
  variant: "oauth" | "shared";
  settings: GoogleSheetsSettings;
  canEdit: boolean;
  isBusy: boolean;
  activeMode: GoogleSheetMode;
  oauthStatus?: "ok" | "error" | null;
  onCheckOAuthStatus?: () => Promise<void> | void;
  updateDbWithSheetEnabled?: boolean;
  onToggleUpdateDbWithSheet?: (enabled: boolean) => Promise<void> | void;
  onSetActiveMode: (mode: GoogleSheetMode) => Promise<void> | void;
  onPrimaryAction: () => void;
  onSecondaryAction?: () => void;
  onVerify: () => Promise<void> | void;
  onSave: () => Promise<void> | void;
  onOpenWizard?: () => void;
  onDebug?: () => void;
};

export const CurrentSheetInfoBlock = ({
  variant,
  settings,
  canEdit,
  isBusy,
  activeMode,
  oauthStatus,
  onCheckOAuthStatus,
  updateDbWithSheetEnabled = false,
  onToggleUpdateDbWithSheet,
  onSetActiveMode,
  onPrimaryAction,
  onSecondaryAction,
  onVerify,
  onDebug,
}: Props) => {
  const defaultSharedProfile =
    settings.sharedSheets?.find((sheet) => sheet.isDefault) ??
    settings.sharedSheets?.[0];
  const activeOAuthSource =
    settings.sources.find((source) => source.active) ??
    settings.sources.find((source) => source.name.trim().toUpperCase() === "POS DATA SHEET") ??
    settings.sources[0];
  const sharedConfig = settings.sharedConfig;
  const sharedSpreadsheetId = defaultSharedProfile?.spreadsheetId ?? sharedConfig?.spreadsheetId ?? "";
  const sharedSpreadsheetTitle = defaultSharedProfile?.spreadsheetTitle ?? sharedConfig?.spreadsheetTitle ?? null;
  const sharedSheetName = defaultSharedProfile?.sheetName ?? sharedConfig?.sheetName ?? "Sheet1";
  const sharedHeaderRow = defaultSharedProfile?.headerRow ?? sharedConfig?.headerRow ?? 1;
  const sharedEnabled = defaultSharedProfile?.enabled ?? sharedConfig?.enabled ?? false;
  const sharedShareStatus = defaultSharedProfile?.shareStatus ?? sharedConfig?.shareStatus ?? "unknown";
  const sharedLastMapping = defaultSharedProfile?.lastMapping ?? sharedConfig?.lastMapping ?? null;
  const sharedColumnsMap = defaultSharedProfile?.columnsMap ?? sharedConfig?.columnsMap ?? {};
  const sharedLastImportAtRaw = defaultSharedProfile?.lastImportAt ?? sharedConfig?.lastImportAt ?? null;
  const sharedLastVerifiedAtRaw = defaultSharedProfile?.lastVerifiedAt ?? sharedConfig?.lastVerifiedAt ?? null;
  const sharedName = defaultSharedProfile?.name ?? "POS DATA SHEET";
  const isActive = activeMode === (variant === "oauth" ? "oauth" : "service_account");
  const oauthConnected = Boolean(settings.connected);

  const oauthRange = activeOAuthSource?.range ?? "";
  const oauthTab = oauthRange.split("!")[0]?.replace(/^'/, "").replace(/'$/, "") || "Sheet1";
  const lastImportAt = variant === "shared" && sharedLastImportAtRaw ? new Date(sharedLastImportAtRaw) : null;
  const lastVerifiedAt = variant === "shared" && sharedLastVerifiedAtRaw ? new Date(sharedLastVerifiedAtRaw) : null;
  const mappedCount =
    variant === "oauth"
      ? Object.keys(activeOAuthSource?.mapping ?? {}).length
      : sharedLastMapping?.columnsMap
        ? Object.keys(sharedLastMapping.columnsMap).length
        : Object.keys(sharedColumnsMap).length;

  const spreadsheetId =
    variant === "oauth"
      ? activeOAuthSource?.spreadsheetId ?? ""
      : sharedSpreadsheetId;
  const spreadsheetTitle = variant === "shared" ? sharedSpreadsheetTitle : null;

  const statusLabel =
    variant === "oauth"
      ? oauthConnected
        ? oauthStatus === "ok"
          ? "Working"
          : oauthStatus === "error"
            ? "Needs verify"
            : "Connected"
        : "Disconnected"
      : sharedEnabled
        ? "Working"
        : sharedSpreadsheetId
          ? "Needs verify"
          : "Disconnected";

  const statusColor: "default" | "success" | "warning" | "error" =
    statusLabel === "Working"
      ? "success"
      : statusLabel === "Needs verify"
        ? "warning"
        : "default";

  const handleCopySpreadsheetId = async () => {
    if (!spreadsheetId) return;
    try {
      await navigator.clipboard?.writeText(spreadsheetId);
    } catch {
      // ignore copy failures
    }
  };

  const InfoRow = ({
    label,
    value,
  }: {
    label: string;
    value: React.ReactNode;
  }) => (
    <Stack direction="row" spacing={1} alignItems="flex-start">
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ minWidth: 110, pt: 0.25 }}
      >
        {label}
      </Typography>
      <Typography variant="body2" color="text.primary">
        {value}
      </Typography>
    </Stack>
  );

  return (
    <Stack spacing={2}>
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        spacing={1}
      >
        <Typography variant="subtitle1" fontWeight={600}>
          Sheet Info
        </Typography>
        <Chip
          size="small"
          label={statusLabel}
          color={statusColor}
          variant="outlined"
        />
      </Stack>

      <Grid container spacing={2} alignItems="flex-start">
        <Grid item xs={12} md={7}>
          <Stack spacing={0.75}>
            {variant === "oauth" && (
              <InfoRow
                label="Connected"
                value={
                  oauthConnected
                    ? settings.connectedEmail
                      ? `Connected as ${settings.connectedEmail}`
                      : "Connected"
                    : "Not connected"
                }
              />
            )}
            {variant === "shared" && settings.serviceAccountEmail && (
              <InfoRow
                label="Service account"
                value={settings.serviceAccountEmail}
              />
            )}
            <InfoRow
              label="Source name"
              value={
                variant === "oauth"
                  ? activeOAuthSource?.name ?? "POS DATA SHEET"
                  : sharedName
              }
            />
            <InfoRow
              label="Spreadsheet"
              value={
                spreadsheetId ? (
                  <Stack
                    direction="row"
                    spacing={1}
                    alignItems="center"
                    flexWrap="wrap"
                  >
                    <Typography variant="body2" color="text.primary">
                      {spreadsheetTitle ?? "Untitled sheet"}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      ({spreadsheetId.slice(0, 12)}…)
                    </Typography>
                    <Tooltip title="Copy ID">
                      <IconButton
                        size="small"
                        onClick={() => void handleCopySpreadsheetId()}
                      >
                        <ContentCopyIcon fontSize="inherit" />
                      </IconButton>
                    </Tooltip>
                    <Button
                      size="small"
                      variant="text"
                      href={`https://docs.google.com/spreadsheets/d/${spreadsheetId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Open sheet
                    </Button>
                  </Stack>
                ) : (
                  "Not set"
                )
              }
            />
            <InfoRow
              label="Tab / header"
              value={
                <>
                  {variant === "oauth" ? oauthTab : sharedSheetName} · Header row{" "}
                  {variant === "oauth" ? 1 : sharedHeaderRow}
                </>
              }
            />
            {variant === "shared" && (
              <InfoRow
                label="Share status"
                value={sharedShareStatus}
              />
            )}
            {mappedCount > 0 && (
              <InfoRow label="Mapped fields" value={mappedCount} />
            )}
            {lastVerifiedAt && (
              <InfoRow
                label="Last verified"
                value={lastVerifiedAt.toLocaleString()}
              />
            )}
            {lastImportAt && (
              <InfoRow
                label="Last import"
                value={lastImportAt.toLocaleString()}
              />
            )}
          </Stack>
        </Grid>

        <Grid item xs={12} md={5}>
          <Stack
            spacing={1.25}
            alignItems={{ xs: "flex-start", md: "flex-end" }}
            sx={{ width: "100%" }}
          >
            <Stack direction="row" spacing={1}>
              {!isActive && (
                <Button
                  size="small"
                  variant="outlined"
                  onClick={() =>
                    onSetActiveMode(
                      variant === "oauth" ? "oauth" : "service_account",
                    )
                  }
                  disabled={!canEdit || isBusy}
                >
                  Use this mode
                </Button>
              )}
              {variant === "oauth" && !oauthConnected && (
                <Button
                  size="small"
                  variant="contained"
                  onClick={onPrimaryAction}
                  disabled={!canEdit || isBusy}
                >
                  Connect
                </Button>
              )}
            </Stack>

            {onToggleUpdateDbWithSheet != null &&
              (variant === "shared" && Boolean(sharedSpreadsheetId)) && (
              <Box sx={{ minWidth: 0, width: "100%" }}>
                <Stack spacing={0.5}>
                  <Stack
                    direction="row"
                    alignItems="center"
                    justifyContent="space-between"
                    spacing={1}
                  >
                    <Typography variant="body2" color="text.primary">
                      Update DB with sheet
                    </Typography>
                    <Switch
                      checked={updateDbWithSheetEnabled}
                      onChange={(_e, checked) =>
                        void onToggleUpdateDbWithSheet(checked)
                      }
                      disabled={!canEdit || isBusy}
                      color="primary"
                      sx={{
                        width: 46,
                        height: 26,
                        padding: 0,
                        "& .MuiSwitch-switchBase": {
                          padding: 0.5,
                          "&.Mui-checked": {
                            transform: "translateX(20px)",
                          },
                        },
                        "& .MuiSwitch-thumb": {
                          width: 18,
                          height: 18,
                        },
                        "& .MuiSwitch-track": {
                          borderRadius: 13,
                        },
                      }}
                    />
                  </Stack>
                  <Typography variant="caption" color="text.secondary">
                    When on, new sheet data syncs automatically from this sheet
                    into POS data.
                  </Typography>
                </Stack>
              </Box>
            )}

            <Divider sx={{ width: "100%", my: 0.5 }} />

            <Stack
              direction="row"
              spacing={1}
              justifyContent="flex-end"
              flexWrap="wrap"
              sx={{ width: "100%" }}
            >
              {onDebug && (
                <Button
                  size="small"
                  variant="outlined"
                  onClick={onDebug}
                  disabled={isBusy}
                >
                  Debug
                </Button>
              )}
              <Button
                size="small"
                variant="contained"
                color="success"
                onClick={variant === "oauth" ? onCheckOAuthStatus : onVerify}
                disabled={!canEdit || isBusy}
              >
                {variant === "oauth" ? "Check connection" : "Verify access"}
              </Button>
              {onSecondaryAction && (
                <Button
                  size="small"
                  variant="text"
                  color="error"
                  onClick={onSecondaryAction}
                  disabled={!canEdit || isBusy}
                >
                  Disconnect
                </Button>
              )}
            </Stack>
          </Stack>
        </Grid>
      </Grid>
    </Stack>
  );
};
