import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Divider,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import SettingsSuggestIcon from "@mui/icons-material/SettingsSuggest";
import LinkIcon from "@mui/icons-material/Link";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import SyncAltIcon from "@mui/icons-material/SyncAlt";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import GoogleIcon from "@mui/icons-material/Google";
import TableChartIcon from "@mui/icons-material/TableChart";
import AccountBalanceWalletIcon from "@mui/icons-material/AccountBalanceWallet";
import ShareIcon from "@mui/icons-material/Share";
import { useEffect, useState } from "react";
import { AxiosError } from "axios";
import { NoAccess, PageHeader } from '../../components';
import { settingsApi, type GoogleSheetMode } from '../../api';
import { useAppDispatch, useAppSelector } from '../../app/store/hooks';
import { showSnackbar } from '../../slices/ui/uiSlice';
import { hasPermission } from '../../lib/utils/permissions';

type IntegrationSettings = {
  googleSheets: {
    mode: GoogleSheetMode;
    serviceAccountEmail: string;
    connected: boolean;
    connectedEmail: string | null;
    sources: Array<{
      sourceId: string;
      name: string;
      spreadsheetId: string;
      sheetGid: string | null;
      range: string;
      mapping: Record<string, string>;
      active: boolean;
    }>;
    sharedConfig?: {
      spreadsheetId: string | null;
      sheetName: string;
      headerRow: number;
      enabled: boolean;
      shareStatus?: 'unknown' | 'not_shared' | 'shared' | 'no_permission' | 'not_found';
      lastVerifiedAt?: string | null;
      lastImportAt?: string | null;
      lastMapping?: {
        columnsMap?: Record<string, string>;
        createdAt?: string | null;
        createdBy?: string | null;
      } | null;
    };
  };
  quickbooks: {
    connected: boolean;
    environment: "sandbox" | "production";
    realmId: string | null;
    companyName: string | null;
  };
};

const DEFAULT_RANGE = "Sheet1!A1:Z";
const DEFAULT_EMAIL =
  "retailsync-run-sa@lively-infinity-488304-m9.iam.gserviceaccount.com";

const getErrorMessage = (error: unknown, fallback: string) => {
  const axiosError = error as AxiosError<{ message?: string }>;
  return axiosError.response?.data?.message ?? fallback;
};

export const SettingsPage = () => {
  const dispatch = useAppDispatch();
  const permissions = useAppSelector((state) => state.auth.permissions);
  const canView = hasPermission(permissions, "rolesSettings", "view");
  const canEdit = hasPermission(permissions, "rolesSettings", "edit");

  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<IntegrationSettings | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [sourceName, setSourceName] = useState("POS Sheet");
  const [spreadsheetId, setSpreadsheetId] = useState("");
  const [range, setRange] = useState(DEFAULT_RANGE);
  const [mappingJson, setMappingJson] = useState(
    '{\n  "date": "Date",\n  "amount": "Amount"\n}',
  );
  const [preview, setPreview] = useState<string[][]>([]);
  const [sharedSpreadsheetId, setSharedSpreadsheetId] = useState('');
  const [sharedSheetName, setSharedSheetName] = useState('Sheet1');
  const [sharedHeaderRow, setSharedHeaderRow] = useState(1);
  const [isBusy, setIsBusy] = useState(false);
  const [integrationsExpanded, setIntegrationsExpanded] = useState(true);
  const [googleEditing, setGoogleEditing] = useState(false);

  const loadSettings = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await settingsApi.get();
      const data = res.data.data as IntegrationSettings;
      setSettings(data);
      const activeSource =
        data.googleSheets.sources.find((source) => source.active) ??
        data.googleSheets.sources[0];
      if (activeSource) {
        setSourceName(activeSource.name);
        setSpreadsheetId(activeSource.spreadsheetId);
        setRange(activeSource.range);
        setMappingJson(JSON.stringify(activeSource.mapping ?? {}, null, 2));
      }
      if (data.googleSheets.sharedConfig) {
        setSharedSpreadsheetId(data.googleSheets.sharedConfig.spreadsheetId ?? '');
        setSharedSheetName(data.googleSheets.sharedConfig.sheetName || 'Sheet1');
        setSharedHeaderRow(data.googleSheets.sharedConfig.headerRow || 1);
      }
      setGoogleEditing(false);
    } catch (err) {
      setError(getErrorMessage(err, "Failed to load settings"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadSettings();
  }, []);

  if (!canView) {
    return <NoAccess />;
  }

  const canEditGoogleDetails =
    googleEditing && canEdit && !isBusy && settings?.googleSheets.connected;

  const onModeChange = async (mode: GoogleSheetMode) => {
    if (!canEdit) return;
    try {
      setIsBusy(true);
      await settingsApi.setGoogleMode(mode);
      dispatch(
        showSnackbar({ message: "Google mode updated", severity: "success" }),
      );
      await loadSettings();
    } catch (err) {
      dispatch(
        showSnackbar({
          message: getErrorMessage(err, "Failed to update mode"),
          severity: "error",
        }),
      );
    } finally {
      setIsBusy(false);
    }
  };

  const onConnectGoogle = async () => {
    if (!canEdit) return;
    try {
      setIsBusy(true);
      const res = await settingsApi.getGoogleConnectUrl();
      const url = (res.data as { data?: { url?: string } }).data?.url;
      if (!url) {
        throw new Error("OAuth URL was not returned by server");
      }
      window.location.assign(url);
    } catch (err) {
      dispatch(
        showSnackbar({
          message: getErrorMessage(err, "Failed to start Google OAuth"),
          severity: "error",
        }),
      );
    } finally {
      setIsBusy(false);
    }
  };

  const onTestAccess = async () => {
    if (!settings) return;
    if (!spreadsheetId.trim() || !range.trim()) {
      dispatch(
        showSnackbar({
          message: "Spreadsheet ID and Range are required",
          severity: "error",
        }),
      );
      return;
    }

    try {
      setIsBusy(true);
      const res = await settingsApi.testGoogleSheet({
        spreadsheetId: spreadsheetId.trim(),
        range: range.trim(),
        authMode: settings.googleSheets.mode,
      });
      setPreview((res.data.data.preview ?? []) as string[][]);
      dispatch(
        showSnackbar({
          message: "Google Sheet access verified",
          severity: "success",
        }),
      );
    } catch (err) {
      dispatch(
        showSnackbar({
          message: getErrorMessage(err, "Google Sheet access failed"),
          severity: "error",
        }),
      );
    } finally {
      setIsBusy(false);
    }
  };

  const onSaveSource = async () => {
    if (!canEdit || !settings) return;
    if (!spreadsheetId.trim() || !range.trim() || !sourceName.trim()) {
      dispatch(
        showSnackbar({
          message: "Name, Spreadsheet ID and Range are required",
          severity: "error",
        }),
      );
      return;
    }

    let mapping: Record<string, string> = {};
    try {
      const parsed = JSON.parse(mappingJson) as Record<string, unknown>;
      mapping = Object.fromEntries(
        Object.entries(parsed).map(([k, v]) => [k, String(v)]),
      );
    } catch {
      dispatch(
        showSnackbar({
          message: "Mapping must be valid JSON",
          severity: "error",
        }),
      );
      return;
    }

    try {
      setIsBusy(true);
      await settingsApi.saveGoogleSource({
        name: sourceName.trim(),
        spreadsheetId: spreadsheetId.trim(),
        range: range.trim(),
        mapping,
        active: true,
      });
      dispatch(
        showSnackbar({ message: "Google source saved", severity: "success" }),
      );
      await loadSettings();
    } catch (err) {
      dispatch(
        showSnackbar({
          message: getErrorMessage(err, "Failed to save source"),
          severity: "error",
        }),
      );
    } finally {
      setIsBusy(false);
    }
  };

  const onDisconnectGoogle = async () => {
    if (!canEdit) return;
    try {
      setIsBusy(true);
      await settingsApi.disconnectGoogle();
      dispatch(
        showSnackbar({ message: "Google disconnected", severity: "success" }),
      );
      await loadSettings();
    } catch (err) {
      dispatch(
        showSnackbar({
          message: getErrorMessage(err, "Failed to disconnect Google"),
          severity: "error",
        }),
      );
    } finally {
      setIsBusy(false);
    }
  };

  const onSaveSharedConfig = async () => {
    if (!canEdit) return;
    if (!sharedSpreadsheetId.trim()) {
      dispatch(showSnackbar({ message: 'Spreadsheet ID is required', severity: 'error' }));
      return;
    }
    try {
      setIsBusy(true);
      await settingsApi.configureSharedSheet({
        spreadsheetId: sharedSpreadsheetId.trim(),
        sheetName: sharedSheetName.trim() || 'Sheet1',
        headerRow: sharedHeaderRow,
        enabled: true
      });
      dispatch(showSnackbar({ message: 'Shared sheet config saved', severity: 'success' }));
      await loadSettings();
    } catch (err) {
      dispatch(
        showSnackbar({
          message: getErrorMessage(err, 'Failed to save shared sheet config'),
          severity: 'error'
        })
      );
    } finally {
      setIsBusy(false);
    }
  };

  const onVerifySharedConfig = async () => {
    if (!canEdit) return;
    try {
      setIsBusy(true);
      await settingsApi.verifySharedSheet();
      dispatch(showSnackbar({ message: 'Shared sheet verified', severity: 'success' }));
      await loadSettings();
    } catch (err) {
      dispatch(
        showSnackbar({
          message: getErrorMessage(err, 'Shared sheet verify failed'),
          severity: 'error'
        })
      );
      await loadSettings();
    } finally {
      setIsBusy(false);
    }
  };

  const onConnectQuickbooks = async () => {
    if (!canEdit) return;
    try {
      setIsBusy(true);
      await settingsApi.connectQuickbooks();
    } catch (err) {
      dispatch(
        showSnackbar({
          message: getErrorMessage(err, "QuickBooks connect failed"),
          severity: "error",
        }),
      );
    } finally {
      setIsBusy(false);
    }
  };

  const onQuickbooksEnvironment = async (value: "sandbox" | "production") => {
    if (!canEdit) return;
    try {
      setIsBusy(true);
      await settingsApi.setQuickbooks({ environment: value });
      dispatch(
        showSnackbar({
          message: "QuickBooks environment updated",
          severity: "success",
        }),
      );
      await loadSettings();
    } catch (err) {
      dispatch(
        showSnackbar({
          message: getErrorMessage(err, "QuickBooks update failed"),
          severity: "error",
        }),
      );
    } finally {
      setIsBusy(false);
    }
  };

  const onDisconnectQuickbooks = async () => {
    if (!canEdit) return;
    try {
      setIsBusy(true);
      await settingsApi.disconnectQuickbooks();
      dispatch(
        showSnackbar({
          message: "QuickBooks disconnected",
          severity: "success",
        }),
      );
      await loadSettings();
    } catch (err) {
      dispatch(
        showSnackbar({
          message: getErrorMessage(err, "Failed to disconnect QuickBooks"),
          severity: "error",
        }),
      );
    } finally {
      setIsBusy(false);
    }
  };

  const copyServiceEmail = async () => {
    const email = settings?.googleSheets.serviceAccountEmail ?? DEFAULT_EMAIL;
    try {
      await navigator.clipboard.writeText(email);
      dispatch(
        showSnackbar({
          message: "Service account email copied",
          severity: "success",
        }),
      );
    } catch {
      dispatch(showSnackbar({ message: "Copy failed", severity: "error" }));
    }
  };

  return (
    <Stack spacing={2.5}>
      <PageHeader
        title="Settings"
        subtitle="Manage Google Sheets and QuickBooks integration configuration"
        icon={<SettingsSuggestIcon />}
      />

      {error && <Alert severity="error">{error}</Alert>}
      {loading && <Alert severity="info">Loading settings...</Alert>}

      {settings && (
        <Accordion
          expanded={integrationsExpanded}
          onChange={(_e, expanded) => setIntegrationsExpanded(expanded)}
          sx={{
            border: "1px solid #e2e8f0",
            borderRadius: 2,
            "&:before": { display: "none" },
          }}
        >
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Stack spacing={0.25}>
              <Typography variant="h6">Integrations</Typography>
              <Typography variant="body2" color="text.secondary">
                Expand to configure Google Sheets and QuickBooks.
              </Typography>
            </Stack>
          </AccordionSummary>
          <AccordionDetails>
            <Stack spacing={2.5}>
              <Card>
                <CardContent>
                  <Stack spacing={2}>
                    {(() => {
                      const shared = settings.googleSheets.sharedConfig;
                      const hasSheet = Boolean(shared?.spreadsheetId);
                      let sheetsStatusLabel = "Not configured";
                      let sheetsStatusColor: "default" | "warning" | "success" = "default";
                      if (settings.googleSheets.connected) {
                        sheetsStatusLabel = "Connected";
                        sheetsStatusColor = "success";
                      } else if (hasSheet) {
                        sheetsStatusLabel = "Configured";
                        sheetsStatusColor = "warning";
                      }
                      return (
                    <Stack
                      direction="row"
                      justifyContent="space-between"
                      alignItems="center"
                    >
                      <Stack spacing={0.5}>
                        <Stack direction="row" spacing={1} alignItems="center">
                          <Box
                            component="img"
                            src="/google-sheets-icon.svg"
                            alt="Google Sheets"
                            sx={{ width: 24, height: 24 }}
                          />
                          <Typography variant="h6">Google Sheets</Typography>
                        </Stack>
                        <ToggleButtonGroup
                          exclusive
                          color="success"
                          size="small"
                          value={settings.googleSheets.mode}
                          onChange={(_e, value: GoogleSheetMode | null) => {
                            if (!value || !canEdit || isBusy) return;
                            void onModeChange(value);
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
                              <span>Shared sheet</span>
                            </Stack>
                          </ToggleButton>
                        </ToggleButtonGroup>
                      </Stack>
                      <Stack direction="row" spacing={1} alignItems="center">
                        <Chip
                          size="small"
                          label={sheetsStatusLabel}
                          color={sheetsStatusColor}
                          variant={sheetsStatusColor === "default" ? "outlined" : "filled"}
                        />
                        <Chip
                          size="small"
                          label={
                            settings.googleSheets.connected
                              ? settings.googleSheets.connectedEmail
                                ? `Connected as ${settings.googleSheets.connectedEmail}`
                                : "Connected"
                              : "Not connected"
                          }
                          color={
                            settings.googleSheets.connected ? "success" : "default"
                          }
                          variant={
                            settings.googleSheets.connected ? "filled" : "outlined"
                          }
                        />
                        {settings.googleSheets.mode === "oauth" && (
                          <Button
                            size="small"
                            color="error"
                            onClick={onDisconnectGoogle}
                            disabled={isBusy || !canEdit}
                          >
                            Disconnect
                          </Button>
                        )}
                        <Button
                          size="small"
                          variant={googleEditing ? "contained" : "outlined"}
                          onClick={() => setGoogleEditing((prev) => !prev)}
                          disabled={isBusy || !canEdit || !settings.googleSheets.connected}
                        >
                          {googleEditing ? "Done" : "Edit"}
                        </Button>
                      </Stack>
                    </Stack>
                      );
                    })()}

                    {settings.googleSheets.sharedConfig && (
                      <Box
                        sx={{
                          p: 1.5,
                          borderRadius: 1,
                          bgcolor: "action.hover",
                          border: "1px solid",
                          borderColor: "divider",
                        }}
                      >
                        <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
                          Current sheet & mapping
                        </Typography>
                        <Stack
                          direction="row"
                          spacing={1}
                          flexWrap="wrap"
                          sx={{ mb: 0.5 }}
                        >
                          {settings.googleSheets.sharedConfig.spreadsheetId && (
                            <Chip
                              size="small"
                              label={`ID: ${settings.googleSheets.sharedConfig.spreadsheetId.slice(0, 8)}…`}
                            />
                          )}
                          <Chip
                            size="small"
                            label={`Tab: ${settings.googleSheets.sharedConfig.sheetName || "Sheet1"}`}
                          />
                          <Chip
                            size="small"
                            label={`Header: ${settings.googleSheets.sharedConfig.headerRow || 1}`}
                          />
                          <Chip
                            size="small"
                            label={`Share: ${settings.googleSheets.sharedConfig.shareStatus ?? "unknown"}`}
                          />
                          {settings.googleSheets.sharedConfig.lastImportAt && (
                            <Chip
                              size="small"
                              label={`Last import: ${new Date(
                                settings.googleSheets.sharedConfig.lastImportAt,
                              ).toLocaleString()}`}
                            />
                          )}
                        </Stack>
                        {settings.googleSheets.sharedConfig.lastMapping?.columnsMap && (
                          <Typography variant="body2" color="text.secondary">
                            Last mapped fields:{" "}
                            {Object.keys(
                              settings.googleSheets.sharedConfig.lastMapping.columnsMap,
                            ).join(", ") || "none"}
                          </Typography>
                        )}
                      </Box>
                    )}

                    {settings.googleSheets.mode === "oauth" ? (
                      <Stack spacing={1.5}>
                        <Stack
                          direction={{ xs: "column", md: "row" }}
                          spacing={1}
                          alignItems={{ md: "center" }}
                        >
                          <Button
                            variant="outlined"
                            startIcon={<LinkIcon />}
                            onClick={onConnectGoogle}
                            disabled={isBusy || !canEdit}
                          >
                            {settings.googleSheets.connected ? 'Reconnect Google' : 'Connect Google'}
                          </Button>
                          <Typography variant="body2" color="text.secondary">
                            {settings.googleSheets.connectedEmail
                              ? `Connected as ${settings.googleSheets.connectedEmail}`
                              : "Connect once, then configure your spreadsheet below."}
                          </Typography>
                        </Stack>

                        {settings.googleSheets.connected && (
                          <>
                            <Divider />
                            <Typography variant="subtitle2">Sheet Configuration</Typography>
                            <TextField
                              label="Spreadsheet ID"
                              size="small"
                              value={sharedSpreadsheetId}
                              onChange={(e) => setSharedSpreadsheetId(e.target.value)}
                              fullWidth
                              placeholder="Paste your Google Spreadsheet ID or full URL"
                              InputProps={{ readOnly: !canEditGoogleDetails }}
                              disabled={!canEditGoogleDetails}
                            />
                            <Stack direction={{ xs: 'column', md: 'row' }} spacing={1}>
                              <TextField
                                label="Sheet Tab"
                                size="small"
                                value={sharedSheetName}
                                onChange={(e) => setSharedSheetName(e.target.value)}
                                fullWidth
                                InputProps={{ readOnly: !canEditGoogleDetails }}
                                disabled={!canEditGoogleDetails}
                              />
                              <TextField
                                label="Header Row"
                                type="number"
                                size="small"
                                value={sharedHeaderRow}
                                onChange={(e) => setSharedHeaderRow(Number(e.target.value || 1))}
                                sx={{ width: { xs: '100%', md: 160 } }}
                                InputProps={{ readOnly: !canEditGoogleDetails }}
                                disabled={!canEditGoogleDetails}
                              />
                            </Stack>
                            <Stack direction={{ xs: 'column', md: 'row' }} spacing={1}>
                              <Button
                                variant="outlined"
                                onClick={onSaveSharedConfig}
                                disabled={!canEditGoogleDetails}
                              >
                                Save Sheet Config
                              </Button>
                              <Button
                                variant="contained"
                                onClick={onVerifySharedConfig}
                                disabled={!canEditGoogleDetails}
                              >
                                Verify Sheet Access
                              </Button>
                            </Stack>
                            <Typography variant="body2" color="text.secondary">
                              Share status: {settings.googleSheets.sharedConfig?.shareStatus ?? 'unknown'}
                            </Typography>
                          </>
                        )}
                      </Stack>
                    ) : (
                      <Stack spacing={1}>
                        <Stack direction="row" spacing={1} alignItems="center">
                          <TextField
                            size="small"
                            label="Service Account Email"
                            value={
                              settings.googleSheets.serviceAccountEmail ||
                              DEFAULT_EMAIL
                            }
                            fullWidth
                            InputProps={{ readOnly: true }}
                          />
                          <Button
                            variant="text"
                            startIcon={<ContentCopyIcon />}
                            onClick={copyServiceEmail}
                          >
                            Copy
                          </Button>
                        </Stack>
                        <TextField
                          label="Shared Spreadsheet ID"
                          size="small"
                          value={sharedSpreadsheetId}
                          onChange={(e) => setSharedSpreadsheetId(e.target.value)}
                          fullWidth
                          InputProps={{ readOnly: !canEditGoogleDetails }}
                          disabled={!canEditGoogleDetails}
                        />
                        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1}>
                          <TextField
                            label="Sheet Tab"
                            size="small"
                            value={sharedSheetName}
                            onChange={(e) => setSharedSheetName(e.target.value)}
                            fullWidth
                            InputProps={{ readOnly: !canEditGoogleDetails }}
                            disabled={!canEditGoogleDetails}
                          />
                          <TextField
                            label="Header Row"
                            type="number"
                            size="small"
                            value={sharedHeaderRow}
                            onChange={(e) => setSharedHeaderRow(Number(e.target.value || 1))}
                            sx={{ width: { xs: '100%', md: 160 } }}
                            InputProps={{ readOnly: !canEditGoogleDetails }}
                            disabled={!canEditGoogleDetails}
                          />
                        </Stack>
                        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1}>
                          <Button
                            variant="outlined"
                            onClick={onSaveSharedConfig}
                            disabled={!canEditGoogleDetails}
                          >
                            Save Shared Config
                          </Button>
                          <Button
                            variant="contained"
                            onClick={onVerifySharedConfig}
                            disabled={!canEditGoogleDetails}
                          >
                            Verify Shared Sheet
                          </Button>
                        </Stack>
                        <Typography variant="body2" color="text.secondary">
                          Share status: {settings.googleSheets.sharedConfig?.shareStatus ?? 'unknown'}
                        </Typography>
                      </Stack>
                    )}

                    <Divider />

                    <TextField
                      label="Source Name"
                      value={sourceName}
                      onChange={(e) => setSourceName(e.target.value)}
                      size="small"
                      fullWidth
                      InputProps={{ readOnly: !canEditGoogleDetails }}
                      disabled={!canEditGoogleDetails}
                    />
                    <TextField
                      label="Spreadsheet ID"
                      value={spreadsheetId}
                      onChange={(e) => setSpreadsheetId(e.target.value)}
                      size="small"
                      fullWidth
                      InputProps={{ readOnly: !canEditGoogleDetails }}
                      disabled={!canEditGoogleDetails}
                    />
                    <TextField
                      label="Range"
                      value={range}
                      onChange={(e) => setRange(e.target.value)}
                      size="small"
                      fullWidth
                      InputProps={{ readOnly: !canEditGoogleDetails }}
                      disabled={!canEditGoogleDetails}
                    />
                    <TextField
                      label="Field Mapping (JSON)"
                      value={mappingJson}
                      onChange={(e) => setMappingJson(e.target.value)}
                      multiline
                      minRows={5}
                      fullWidth
                      InputProps={{ readOnly: !canEditGoogleDetails }}
                      disabled={!canEditGoogleDetails}
                    />
                    <Stack direction={{ xs: "column", md: "row" }} spacing={1}>
                      <Button
                        variant="outlined"
                        onClick={onTestAccess}
                        disabled={!canEditGoogleDetails}
                      >
                        Test Access
                      </Button>
                      <Button
                        variant="contained"
                        onClick={onSaveSource}
                        disabled={!canEditGoogleDetails}
                      >
                        Save Source
                      </Button>
                    </Stack>

                    {preview.length > 0 && (
                      <Box>
                        <Typography variant="subtitle2" sx={{ mb: 1 }}>
                          Preview (first 10 rows)
                        </Typography>
                        <Box
                          sx={{
                            p: 1.5,
                            border: "1px solid",
                            borderColor: "divider",
                            borderRadius: 1,
                          }}
                        >
                          {preview.map((row, index) => (
                            <Typography
                              key={`${index}-${row.join("|")}`}
                              variant="body2"
                              sx={{ fontFamily: "monospace" }}
                            >
                              {row.join(" | ")}
                            </Typography>
                          ))}
                        </Box>
                      </Box>
                    )}
                  </Stack>
                </CardContent>
              </Card>

              <Card>
                <CardContent>
                  <Stack spacing={2}>
                    <Stack
                      direction="row"
                      justifyContent="space-between"
                      alignItems="center"
                    >
                      <Stack direction="row" spacing={1} alignItems="center">
                        <AccountBalanceWalletIcon
                          color="primary"
                          fontSize="small"
                        />
                        <Typography variant="h6">QuickBooks</Typography>
                      </Stack>
                      <Chip
                        size="small"
                        label={
                          settings.quickbooks.connected
                            ? "Connected"
                            : "Not connected"
                        }
                        color={
                          settings.quickbooks.connected ? "success" : "default"
                        }
                        variant={
                          settings.quickbooks.connected ? "filled" : "outlined"
                        }
                      />
                    </Stack>
                    <Stack spacing={0.5}>
                      <Typography variant="subtitle2" color="text.secondary">
                        Environment
                      </Typography>
                      <ToggleButtonGroup
                        exclusive
                        size="small"
                        value={settings.quickbooks.environment}
                        onChange={(_e, value: "sandbox" | "production" | null) => {
                          if (!value || !canEdit || isBusy) return;
                          void onQuickbooksEnvironment(value);
                        }}
                      >
                        <ToggleButton value="sandbox">Sandbox</ToggleButton>
                        <ToggleButton value="production">Production</ToggleButton>
                      </ToggleButtonGroup>
                    </Stack>

                    <Stack direction={{ xs: "column", md: "row" }} spacing={1}>
                      <Button
                        variant="outlined"
                        startIcon={<SyncAltIcon />}
                        onClick={onConnectQuickbooks}
                        disabled={isBusy || !canEdit}
                      >
                        Connect QuickBooks
                      </Button>
                      <Button
                        color="error"
                        onClick={onDisconnectQuickbooks}
                        disabled={isBusy || !canEdit}
                      >
                        Disconnect
                      </Button>
                    </Stack>

                    <Typography variant="body2" color="text.secondary">
                      Realm ID: {settings.quickbooks.realmId ?? "Not set"}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Company: {settings.quickbooks.companyName ?? "Not set"}
                    </Typography>
                  </Stack>
                </CardContent>
              </Card>
            </Stack>
          </AccordionDetails>
        </Accordion>
      )}
    </Stack>
  );
};
