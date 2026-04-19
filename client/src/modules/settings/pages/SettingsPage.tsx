import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Button,
  Collapse,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Stack,
  Typography,
} from "@mui/material";
import SettingsSuggestIcon from "@mui/icons-material/SettingsSuggest";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ErrorIcon from "@mui/icons-material/Error";
import RadioButtonUncheckedIcon from "@mui/icons-material/RadioButtonUnchecked";
import AutorenewIcon from "@mui/icons-material/Autorenew";
import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { AxiosError } from "axios";
import { NoAccess, PageHeader } from "../../../components";
import { GoogleSheetsIntegrationCard, QuickBooksIntegrationCard } from "../components";
import {
  getDebugOutcome,
} from "../components/googleSheets/debugOutcomeGuide";
import { settingsApi } from '../api';
import { useAppDispatch, useAppSelector } from "../../../app/store/hooks";
import { showSnackbar } from "../../../app/store/uiSlice";
import { hasPermission } from "../../../utils/permissions";
import { getAppErrorMessage } from "../../../constants/errorCodes";
import { useSettingsPageViewModel } from "../hooks";
import {
  resetGoogleSheetsThunk,
} from "../state";

const OAUTH_WIZARD_RESUME_KEY = "retailsync.googleSheets.oauthResumeWizard";
const shouldLogGoogleSheetsOauthDebug = import.meta.env.DEV && !import.meta.env.VITEST;

const REQUIRED_FIELDS = [
  "date",
  "highTax",
  "lowTax",
  "saleTax",
  "gas",
  "lottery",
  "creditCard",
  "lotteryPayout",
  "cashExpenses",
] as const;

type DebugStep = {
  label: string;
  status: "pending" | "running" | "success" | "error";
  detail?: string;
  logs: string[];
};

const getErrorMessage = (error: unknown, fallback: string) => {
  const axiosError = error as AxiosError<{ message?: string }>;
  return axiosError.response?.data?.message ?? fallback;
};

type SettingsPageProps = {
  showHeader?: boolean;
};

export const SettingsPage = ({ showHeader = true }: SettingsPageProps) => {
  const dispatch = useAppDispatch();
  const location = useLocation();
  const navigate = useNavigate();
  const permissions = useAppSelector((state) => state.auth.permissions);
  const canView = hasPermission(permissions, "rolesSettings", "view");
  const canEdit = hasPermission(permissions, "rolesSettings", "edit");
  const canViewQuickbooks = hasPermission(permissions, "quickbooks", "view");
  const canSyncQuickbooks = hasPermission(permissions, "quickbooks", "actions:sync");

  const [integrationsExpanded, setIntegrationsExpanded] = useState(true);
  const [expandGoogleConfigureSection, setExpandGoogleConfigureSection] = useState(false);
  const [debugOpen, setDebugOpen] = useState(false);
  const [debugTitle, setDebugTitle] = useState("Google Sheets Debug");
  const [debugSteps, setDebugSteps] = useState<DebugStep[]>([]);
  const [debugRunning, setDebugRunning] = useState(false);
  const {
    settings,
    loading,
    error,
    oauthStatus,
    isBusy,
    syncOverview: googleSheetsSyncOverview,
    syncProgress: googleSheetsSyncProgress,
    quickbooksOauthStatus,
    onModeChange,
    onSyncNow,
    onSaveSyncSchedule,
    onDeleteSheetSource,
    onSaveSharedConfig,
    onVerifySharedConfig,
    onCheckOAuthStatus,
    onToggleUpdateDbWithSheet,
    onConnectQuickBooks,
    onDisconnectQuickBooks,
    onRefreshQuickbooksReferences,
    onPostApprovedQuickbooks,
    onRefreshQuickbooksStatus,
    refreshSettings,
  } = useSettingsPageViewModel({
    canEdit,
    canViewQuickbooks,
    canSyncQuickbooks,
  });

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const openSection = params.get("open");
    const expandParam = params.get("expand");
    const googleStatus = params.get("googleSheets");
    const quickbooksStatus = params.get("quickbooks");
    const reason = params.get("reason") ?? undefined;

    if (
      openSection === "google_sheets" ||
      googleStatus === "connected" ||
      quickbooksStatus === "connected"
    ) {
      setIntegrationsExpanded(true);
    }
    if (expandParam === "configure") {
      setExpandGoogleConfigureSection(true);
    }
    if (quickbooksStatus === "connected") {
      dispatch(
        showSnackbar({
          message: "QuickBooks connected successfully.",
          severity: "success",
        }),
      );
      void refreshSettings().finally(() => {
        navigate("/dashboard/settings", { replace: true });
      });
      return;
    }
    if (quickbooksStatus === "error") {
      dispatch(
        showSnackbar({
          message: getAppErrorMessage(reason, "QuickBooks connection error."),
          severity: "error",
        }),
      );
      void refreshSettings().finally(() => {
        navigate("/dashboard/settings", { replace: true });
      });
      return;
    }
    if (googleStatus === "connected") {
      if (typeof window !== "undefined") {
        window.localStorage.setItem(
          OAUTH_WIZARD_RESUME_KEY,
          JSON.stringify({
            profileName: "POS DATA SHEET",
            step: 1,
            source: "oauth",
            reason: "oauth_callback_connected",
          }),
        );
      }
      setExpandGoogleConfigureSection(true);
      dispatch(
        showSnackbar({
          message:
            "Google Sheets connected. Open «Manage sheet & mapping» below to select your spreadsheet and map columns.",
          severity: "success",
        }),
      );
      if (shouldLogGoogleSheetsOauthDebug) {
        console.info("[GoogleSheets OAuth] callback connected; resuming wizard at step 2.");
      }
      void refreshSettings().finally(() => {
        navigate("/dashboard/settings", { replace: true });
      });
      return;
    }
    if (googleStatus === "error") {
      if (shouldLogGoogleSheetsOauthDebug) {
        console.error("[GoogleSheets OAuth] callback error", {
          reason: reason ?? "unknown",
          query: location.search,
        });
      }
      void refreshSettings().then((action) => {
        const payload = (action as { payload?: { googleSheets?: { oauth?: { connectionStatus?: string } } } }).payload;
        const connected = payload?.googleSheets?.oauth?.connectionStatus === "connected";
        if (connected) {
          if (typeof window !== "undefined") {
            window.localStorage.setItem(
              OAUTH_WIZARD_RESUME_KEY,
              JSON.stringify({
                profileName: "POS DATA SHEET",
                step: 1,
                source: "oauth",
                reason: "oauth_callback_error_but_connected",
              }),
            );
          }
          setExpandGoogleConfigureSection(true);
          dispatch(
            showSnackbar({
              message: "Google Sheets connected. Continue with sheet selection.",
              severity: "success",
            }),
          );
          if (shouldLogGoogleSheetsOauthDebug) {
            console.info("[GoogleSheets OAuth] callback returned error but settings show connected; resuming wizard.");
          }
        } else {
          dispatch(
            showSnackbar({
              message: getAppErrorMessage(
                reason,
                "Google Sheets connection error.",
              ),
              severity: "error",
            }),
          );
        }
        navigate("/dashboard/settings", { replace: true });
      });
      return;
    }
    if (openSection || expandParam || googleStatus || quickbooksStatus) {
      navigate("/dashboard/settings", { replace: true });
    }
  }, [location.search, dispatch, navigate]);

  if (!canView) {
    return <NoAccess />;
  }
  const quickbooks = settings?.quickbooks ?? null;

  const appendStepLog = (index: number, message: string, status?: DebugStep["status"]) => {
    setDebugSteps((prev) =>
      prev.map((step, i) => {
        if (i !== index) return step;
        return {
          ...step,
          status: status ?? step.status,
          detail: message,
          logs: [...step.logs, message],
        };
      }),
    );
  };

  const runDebug = async (mode: "oauth" | "shared") => {
    if (!settings) return;
    const steps: DebugStep[] =
      mode === "oauth"
        ? [
            { label: "Check OAuth token", status: "pending", logs: [] },
            { label: "Resolve spreadsheet", status: "pending", logs: [] },
            { label: "List tabs", status: "pending", logs: [] },
            { label: "Read preview rows", status: "pending", logs: [] },
            { label: "Validate mapped fields", status: "pending", logs: [] },
          ]
        : [
            { label: "Resolve shared sheet profile", status: "pending", logs: [] },
            { label: "Verify sheet access", status: "pending", logs: [] },
            { label: "List tabs", status: "pending", logs: [] },
            { label: "Read preview rows", status: "pending", logs: [] },
            { label: "Validate mapped fields", status: "pending", logs: [] },
          ];

    setDebugTitle(
      mode === "oauth"
        ? "Debug: OAuth Sheet"
        : "Debug: Shared Sheet",
    );
    setDebugSteps(steps);
    setDebugOpen(true);
    setDebugRunning(true);

    try {
      const oauthSource =
        settings.googleSheets.sources.find((s) => s.active) ??
        settings.googleSheets.sources[0];
      const sharedProfile =
        settings.googleSheets.sharedSheets?.find((s) => s.isDefault) ??
        settings.googleSheets.sharedSheets?.[0];

      let spreadsheetId = "";
      let sheetName = "Sheet1";
      let mapping: Record<string, string> = {};
      let source: "oauth" | "service";

      if (mode === "oauth") {
        appendStepLog(0, "Validating OAuth connection...", "running");
        const oauth = await settingsApi.getGoogleSheetsOAuthStatus();
        const ok = Boolean(oauth.data?.data?.ok);
        if (!ok) throw new Error("OAuth token is not valid or not connected.");
        appendStepLog(0, "OAuth token is valid.", "success");

        appendStepLog(1, "Resolving active OAuth spreadsheet...", "running");
        spreadsheetId = (oauthSource?.spreadsheetId ?? "").trim();
        if (!spreadsheetId) throw new Error("No active OAuth spreadsheet configured.");
        sheetName = settings.googleSheets.sharedConfig?.sheetName || "Sheet1";
        mapping = oauthSource?.mapping ?? {};
        source = "oauth";
        appendStepLog(1, `Spreadsheet resolved: ${spreadsheetId.slice(0, 10)}...`, "success");
      } else {
        appendStepLog(0, "Resolving default shared profile...", "running");
        if (!sharedProfile?.spreadsheetId) throw new Error("No default shared sheet profile configured.");
        spreadsheetId = sharedProfile.spreadsheetId;
        sheetName = sharedProfile.sheetName || "Sheet1";
        mapping =
          sharedProfile.columnsMap ??
          sharedProfile.lastMapping?.columnsMap ??
          {};
        source = "service";
        appendStepLog(0, `Profile: ${sharedProfile.name}`, "success");

        appendStepLog(1, "Verifying shared sheet access...", "running");
        await settingsApi.verifySharedSheet({ profileId: sharedProfile.profileId });
        appendStepLog(1, "Shared sheet access verified.", "success");
      }

      const tabStepIndex = mode === "oauth" ? 2 : 2;
      appendStepLog(tabStepIndex, "Fetching tabs...", "running");
      const tabsRes = await settingsApi.listTabsWithSpreadsheetId({
        spreadsheetId,
        authMode: mode === "oauth" ? "oauth" : "service_account",
      });
      const tabs = ((tabsRes.data as { data?: { tabs?: Array<{ title: string }> } })?.data?.tabs ?? []);
      if (!tabs.length) throw new Error("No tabs found in spreadsheet.");
      if (!tabs.some((t) => t.title === sheetName)) {
        sheetName = tabs[0].title;
      }
      appendStepLog(tabStepIndex, `Found ${tabs.length} tab(s). Using "${sheetName}".`, "success");

      const previewStepIndex = mode === "oauth" ? 3 : 3;
      appendStepLog(previewStepIndex, "Reading preview rows...", "running");
      const previewRes = await settingsApi.previewSheet({
        source,
        tab: sheetName,
        spreadsheetId,
        headerRow: 1,
        maxRows: 20,
      });
      const header = (previewRes.data?.data?.header ?? []) as string[];
      const sampleRows = (previewRes.data?.data?.sampleRows ?? []) as string[][];
      if (!header.length) throw new Error("Sheet read succeeded but header row is empty.");
      appendStepLog(
        previewStepIndex,
        `Read ${sampleRows.length} sample rows and ${header.length} header fields.`,
        "success",
      );

      const mappingStepIndex = mode === "oauth" ? 4 : 4;
      appendStepLog(mappingStepIndex, "Checking required mapped fields...", "running");
      const mappedTargets = new Set(Object.values(mapping).filter(Boolean));
      const missing = REQUIRED_FIELDS.filter((field) => !mappedTargets.has(field));
      if (missing.length > 0) {
        throw new Error(`Missing required mapped fields: ${missing.join(", ")}`);
      }
      appendStepLog(mappingStepIndex, "All required fields are mapped.", "success");
    } catch (err) {
      const message = getErrorMessage(err, "Debug failed");
      setDebugSteps((prev) => {
        const runningIndex = prev.findIndex((step) => step.status === "running");
        const pendingIndex = prev.findIndex((step) => step.status === "pending");
        const targetIndex = runningIndex >= 0 ? runningIndex : pendingIndex;
        if (targetIndex >= 0) {
          return prev.map((step, i) =>
            i === targetIndex
              ? { ...step, status: "error", detail: message, logs: [...step.logs, message] }
              : step,
          );
        }
        return prev;
      });
    } finally {
      setDebugRunning(false);
    }
  };

  return (
    <Stack spacing={2.5}>
      {showHeader ? (
        <PageHeader
          title="Settings"
          subtitle="Manage Google Sheets and QuickBooks integration configuration"
          icon={<SettingsSuggestIcon />}
        />
      ) : null}

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
                syncOverview={googleSheetsSyncOverview}
                syncProgress={googleSheetsSyncProgress}
                canEdit={canEdit}
                isBusy={isBusy}
                oauthStatus={oauthStatus}
                onCheckOAuthStatus={onCheckOAuthStatus}
                onToggleUpdateDbWithSheet={onToggleUpdateDbWithSheet}
                onReset={async () => {
                  try {
                    await dispatch(resetGoogleSheetsThunk()).unwrap();
                  } catch (err) {
                    dispatch(
                      showSnackbar({
                        message: getErrorMessage(err, "Failed to reset Google Sheets"),
                        severity: "error",
                      }),
                    );
                  }
                }}
                onVerifyShared={onVerifySharedConfig}
                onSaveShared={onSaveSharedConfig}
                onSetActiveMode={onModeChange}
                onSettingsRefetch={async () => { await refreshSettings(); }}
                onSyncNow={onSyncNow}
                onSaveSyncSchedule={onSaveSyncSchedule}
                onDeleteSource={onDeleteSheetSource}
                onDebug={(mode) => { void runDebug(mode); }}
                initialExpandConfigureSection={expandGoogleConfigureSection}
                onConsumedExpandConfigure={() => setExpandGoogleConfigureSection(false)}
              />
              <QuickBooksIntegrationCard
                settings={quickbooks}
                oauthStatus={quickbooksOauthStatus}
                canManageConnection={canEdit}
                canSync={canSyncQuickbooks}
                canRefreshStatus={canViewQuickbooks}
                canViewHealth={canViewQuickbooks}
                busy={isBusy}
                loading={false}
                onConnect={onConnectQuickBooks}
                onDisconnect={onDisconnectQuickBooks}
                onRefreshReferences={onRefreshQuickbooksReferences}
                onPostApproved={onPostApprovedQuickbooks}
                onRefreshStatus={onRefreshQuickbooksStatus}
                detailAction={
                  canViewQuickbooks
                    ? {
                        label: "Open QuickBooks",
                        to: "/dashboard/quickbooks",
                      }
                    : undefined
                }
              />
            </Stack>
          </AccordionDetails>
        </Accordion>
      )}

      <Dialog
        open={debugOpen}
        onClose={() => {
          if (debugRunning) return;
          setDebugOpen(false);
        }}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>{debugTitle}</DialogTitle>
        <DialogContent dividers>
          <List dense>
            {debugSteps.map((step, idx) => (
              <Box
                key={`${step.label}-${idx}`}
                sx={{
                  border: "1px solid",
                  borderColor: "divider",
                  borderRadius: 1,
                  mb: 1,
                }}
              >
                <ListItem>
                  <ListItemIcon sx={{ minWidth: 34 }}>
                    {step.status === "success" && (
                      <CheckCircleIcon color="success" fontSize="small" />
                    )}
                    {step.status === "error" && (
                      <ErrorIcon color="error" fontSize="small" />
                    )}
                    {step.status === "running" && (
                      <AutorenewIcon color="primary" fontSize="small" />
                    )}
                    {step.status === "pending" && (
                      <RadioButtonUncheckedIcon color="disabled" fontSize="small" />
                    )}
                  </ListItemIcon>
                  <ListItemText
                    primary={step.label}
                    secondary={step.status !== "running" ? step.detail : undefined}
                  />
                </ListItem>

                <Collapse in={step.status === "running" || step.status === "error"} timeout="auto" unmountOnExit>
                  <Stack spacing={1} sx={{ px: 2, pb: 1.5, pl: 6 }}>
                    <Typography variant="caption" color="text.secondary">
                      {step.status === "running" ? "Live logs" : "Logs"}
                    </Typography>
                    <Box
                      component="pre"
                      sx={{
                        m: 0,
                        p: 1.25,
                        borderRadius: 1,
                        bgcolor: "action.hover",
                        fontSize: 12,
                        lineHeight: 1.45,
                        whiteSpace: "pre-wrap",
                        wordBreak: "break-word",
                      }}
                    >
                      {step.logs.length > 0 ? step.logs.join("\n") : "Running..."}
                    </Box>

                    {step.status === "error" ? (() => {
                      const outcome = getDebugOutcome(step.detail);
                      return (
                        <Stack spacing={1}>
                          <Alert severity="error">
                            <strong>Possible cause:</strong> {outcome.when}
                          </Alert>
                          <Alert severity="warning">
                            <strong>Solution:</strong> {outcome.solution}
                          </Alert>
                        </Stack>
                      );
                    })() : null}
                  </Stack>
                </Collapse>
              </Box>
            ))}
          </List>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => setDebugOpen(false)}
            disabled={debugRunning}
          >
            Close
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
};
