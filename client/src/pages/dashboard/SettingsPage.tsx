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
  Collapse,
  Divider,
  Link,
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
import { useLocation, useNavigate } from "react-router-dom";
import { AxiosError } from "axios";
import { NoAccess, PageHeader, ImportPOSDataModal } from '../../components';
import { GoogleSheetsIntegrationCard, GoogleSheetsSettings } from '../../components/settings/googleSheets/GoogleSheetsIntegrationCard';
import { settingsApi, type GoogleSheetMode } from '../../api';
import { useAppDispatch, useAppSelector } from '../../app/store/hooks';
import { showSnackbar } from '../../slices/ui/uiSlice';
import { hasPermission } from '../../utils/permissions';
import { getAppErrorMessage } from '../../constants/errorCodes';

type IntegrationSettings = {
  googleSheets: GoogleSheetsSettings;
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
  const location = useLocation();
  const navigate = useNavigate();
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
  const [mappingView, setMappingView] = useState<"json" | "table">("json");
  const [mappingExpanded, setMappingExpanded] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);

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
      setMappingView("json");
    } catch (err) {
      setError(getErrorMessage(err, "Failed to load settings"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const status = params.get("googleSheets");
    const reason = params.get("reason") ?? undefined;
    if (!status) return;

    if (status === "connected") {
      dispatch(
        showSnackbar({
          message: "Google Sheets connected. You can now configure your sheet and mapping.",
          severity: "success",
        }),
      );
    } else if (status === "error") {
      dispatch(
        showSnackbar({
          message: getAppErrorMessage(reason, "Google Sheets connection error."),
          severity: "error",
        }),
      );
    }

    navigate("/dashboard/settings", { replace: true });
  }, [location.search, dispatch, navigate]);

  useEffect(() => {
    void loadSettings();
  }, []);

  if (!canView) {
    return <NoAccess />;
  }

  const canEditGoogleDetails =
    googleEditing && canEdit && !isBusy;
  const oauthConnected = Boolean(settings?.googleSheets.connectedEmail);

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
              <GoogleSheetsIntegrationCard
                settings={settings.googleSheets}
                canEdit={canEdit}
                isBusy={isBusy}
                onConnectOAuth={onConnectGoogle}
                onDisconnectOAuth={onDisconnectGoogle}
                onOpenWizard={() => setWizardOpen(true)}
                onReset={async () => {
                  try {
                    setIsBusy(true);
                    await settingsApi.resetGoogleSheets();
                    await loadSettings();
                  } finally {
                    setIsBusy(false);
                  }
                }}
                onVerifyShared={onVerifySharedConfig}
                onSaveShared={onSaveSharedConfig}
                onSetActiveMode={onModeChange}
              />
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

      <ImportPOSDataModal
        open={wizardOpen}
        onClose={() => setWizardOpen(false)}
        onImported={async () => {
          setWizardOpen(false);
          await loadSettings();
        }}
      />
    </Stack>
  );
};
