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
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import SettingsSuggestIcon from "@mui/icons-material/SettingsSuggest";
import SyncAltIcon from "@mui/icons-material/SyncAlt";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import AccountBalanceWalletIcon from "@mui/icons-material/AccountBalanceWallet";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import ErrorIcon from "@mui/icons-material/Error";
import RadioButtonUncheckedIcon from "@mui/icons-material/RadioButtonUnchecked";
import AutorenewIcon from "@mui/icons-material/Autorenew";
import { useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { AxiosError } from "axios";
import { NoAccess, PageHeader } from "../../../components";
import {
  GoogleSheetsIntegrationCard,
  type GoogleSheetsSyncOverview,
} from "../components/googleSheets/GoogleSheetsIntegrationCard";
import {
  getDebugOutcome,
} from "../components/googleSheets/debugOutcomeGuide";
import { settingsApi, type GoogleSheetMode } from '../api';
import { posApi } from '../../pos/api';
import { useAppDispatch, useAppSelector } from "../../../app/store/hooks";
import { showSnackbar } from "../../../app/store/uiSlice";
import { hasPermission } from "../../../utils/permissions";
import { getAppErrorMessage } from "../../../constants/errorCodes";
import {
  fetchSettings,
  fetchOAuthStatus,
  setGoogleModeThunk,
  configureSharedSheetThunk,
  verifySharedSheetThunk,
  resetGoogleSheetsThunk,
  selectSettings,
  selectSettingsLoading,
  selectSettingsError,
  selectOAuthStatus,
  selectSettingsIsBusy,
} from "../state";

const OAUTH_WIZARD_RESUME_KEY = "retailsync.googleSheets.oauthResumeWizard";

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

export const SettingsPage = () => {
  const dispatch = useAppDispatch();
  const location = useLocation();
  const navigate = useNavigate();
  const permissions = useAppSelector((state) => state.auth.permissions);
  const canView = hasPermission(permissions, "rolesSettings", "view");
  const canEdit = hasPermission(permissions, "rolesSettings", "edit");

  const settings = useAppSelector(selectSettings);
  const loading = useAppSelector(selectSettingsLoading);
  const error = useAppSelector(selectSettingsError);
  const oauthStatus = useAppSelector(selectOAuthStatus);
  const isBusyRedux = useAppSelector(selectSettingsIsBusy);
  const [isBusyLocal, setIsBusyLocal] = useState(false);
  const isBusy = isBusyRedux || isBusyLocal;

  const [sharedSpreadsheetId, setSharedSpreadsheetId] = useState("");
  const [sharedSheetName, setSharedSheetName] = useState("Sheet1");
  const [sharedHeaderRow, setSharedHeaderRow] = useState(1);
  const [integrationsExpanded, setIntegrationsExpanded] = useState(true);
  const [expandGoogleConfigureSection, setExpandGoogleConfigureSection] = useState(false);
  const [debugOpen, setDebugOpen] = useState(false);
  const [debugTitle, setDebugTitle] = useState("Google Sheets Debug");
  const [debugSteps, setDebugSteps] = useState<DebugStep[]>([]);
  const [debugRunning, setDebugRunning] = useState(false);
  const [googleSheetsSyncOverview, setGoogleSheetsSyncOverview] = useState<GoogleSheetsSyncOverview | null>(null);
  const [googleSheetsSyncProgress, setGoogleSheetsSyncProgress] = useState<{ percent: number; stage: string } | null>(null);

  const loadGoogleSheetsSyncOverview = useCallback(async () => {
    try {
      const res = await settingsApi.getGoogleSheetsSyncOverview();
      setGoogleSheetsSyncOverview((res.data as { data?: GoogleSheetsSyncOverview })?.data ?? null);
    } catch {
      setGoogleSheetsSyncOverview(null);
    }
  }, []);

  useEffect(() => {
    void dispatch(fetchSettings());
  }, [dispatch]);

  useEffect(() => {
    if (!settings) return;
    if (settings.googleSheets.sharedConfig) {
      setSharedSpreadsheetId(
        settings.googleSheets.sharedConfig.spreadsheetId ?? "",
      );
      setSharedSheetName(
        settings.googleSheets.sharedConfig.sheetName || "Sheet1",
      );
      setSharedHeaderRow(settings.googleSheets.sharedConfig.headerRow || 1);
    }
  }, [settings]);

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
      void dispatch(fetchSettings()).finally(() => {
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
      void dispatch(fetchSettings()).finally(() => {
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
      console.info("[GoogleSheets OAuth] callback connected; resuming wizard at step 2.");
      void dispatch(fetchSettings()).finally(() => {
        navigate("/dashboard/settings", { replace: true });
      });
      return;
    }
    if (googleStatus === "error") {
      console.error("[GoogleSheets OAuth] callback error", {
        reason: reason ?? "unknown",
        query: location.search,
      });
      void dispatch(fetchSettings()).then((action) => {
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
          console.info("[GoogleSheets OAuth] callback returned error but settings show connected; resuming wizard.");
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

  useEffect(() => {
    if (settings?.googleSheets?.connected) {
      void dispatch(fetchOAuthStatus());
    }
  }, [dispatch, settings?.googleSheets?.connected]);

  useEffect(() => {
    if (!settings) return;
    void loadGoogleSheetsSyncOverview();
  }, [settings, loadGoogleSheetsSyncOverview]);

  if (!canView) {
    return <NoAccess />;
  }
  const defaultSharedProfile =
    settings?.googleSheets.sharedSheets?.find((sheet) => sheet.isDefault) ??
    settings?.googleSheets.sharedSheets?.[0];

  const onModeChange = async (mode: GoogleSheetMode) => {
    if (!canEdit) return;
    try {
      await dispatch(setGoogleModeThunk(mode)).unwrap();
    } catch (err) {
      dispatch(
        showSnackbar({
          message: getErrorMessage(err, "Failed to update mode"),
          severity: "error",
        }),
      );
    }
  };

  const onSyncNow = async () => {
    if (!canEdit || !settings) return;
    let progressTimer: ReturnType<typeof setInterval> | null = null;
    try {
      setIsBusyLocal(true);
      setGoogleSheetsSyncProgress({ percent: 12, stage: "Starting sync..." });
      progressTimer = setInterval(() => {
        setGoogleSheetsSyncProgress((current) => {
          if (!current || current.percent >= 90) return current;
          return { ...current, percent: Math.min(90, current.percent + 8) };
        });
      }, 350);
      const parseRangeTab = (range?: string) => {
        if (!range) return "Sheet1";
        const tab = range.split("!")[0]?.trim();
        return tab ? tab.replace(/^'/, "").replace(/'$/, "") : "Sheet1";
      };

      let payload: { mapping: Record<string, string>; transforms?: Record<string, unknown>; options?: Record<string, unknown> } | null = null;
      if (settings.googleSheets.mode === "oauth") {
        const oauthSource =
          settings.googleSheets.sources.find((source) => source.name.trim().toUpperCase() === "POS DATA SHEET") ??
          settings.googleSheets.sources.find((source) => source.active) ??
          settings.googleSheets.sources[0];
        if (oauthSource?.spreadsheetId) {
          payload = {
            mapping: oauthSource.mapping ?? {},
            transforms: oauthSource.transformations ?? {},
            options: {
              mode: "oauth",
              profileName: oauthSource.name,
              sourceId: oauthSource.sourceId,
              spreadsheetId: oauthSource.spreadsheetId,
              tab: parseRangeTab(oauthSource.range),
              headerRow: 1,
            },
          };
        }
      } else {
        const sharedProfile =
          settings.googleSheets.sharedSheets?.find((sheet) => sheet.name.trim().toUpperCase() === "POS DATA SHEET") ??
          settings.googleSheets.sharedSheets?.find((sheet) => sheet.isDefault) ??
          settings.googleSheets.sharedSheets?.[0];
        if (sharedProfile?.spreadsheetId) {
          payload = {
            mapping:
              sharedProfile.columnsMap ??
              sharedProfile.lastMapping?.columnsMap ??
              {},
            transforms: (sharedProfile.lastMapping?.transformations as Record<string, unknown> | undefined) ?? {},
            options: {
              mode: "service_account",
              profileId: sharedProfile.profileId,
              profileName: sharedProfile.name,
              tab: sharedProfile.sheetName || "Sheet1",
              headerRow: Number(sharedProfile.headerRow ?? 1),
            },
          };
        }
      }

      if (!payload || Object.keys(payload.mapping ?? {}).length === 0) {
        dispatch(
          showSnackbar({
            message: "No saved mapping found for the selected sheet. Configure mapping first.",
            severity: "error",
          }),
        );
        return;
      }

      const res = await posApi.commitImport(payload);
      const summary = res.data?.data?.result ?? {};
      const imported = Number(summary.imported ?? 0);
      const upserted = Number(summary.upserted ?? 0);
      const modified = Number(summary.modified ?? 0);
      setGoogleSheetsSyncProgress({
        percent: 100,
        stage: `Sync complete. Processed ${imported} rows.`,
      });
      dispatch(
        showSnackbar({
          message: `Sync completed: ${imported} rows (upserted ${upserted}, updated ${modified})`,
          severity: "success",
        }),
      );
      await dispatch(fetchSettings());
      await loadGoogleSheetsSyncOverview();
      window.setTimeout(() => setGoogleSheetsSyncProgress(null), 1800);
    } catch (err) {
      setGoogleSheetsSyncProgress(null);
      dispatch(
        showSnackbar({
          message: getErrorMessage(err, "Sync failed"),
          severity: "error",
        }),
      );
    } finally {
      if (progressTimer) clearInterval(progressTimer);
      setIsBusyLocal(false);
    }
  };

  const onSaveSyncSchedule = async (payload: { enabled: boolean; hour: number; minute: number; timezone: string }) => {
    if (!canEdit) return;
    try {
      setIsBusyLocal(true);
      await settingsApi.saveGoogleSheetsSyncSchedule(payload);
      dispatch(
        showSnackbar({
          message: "Sync settings updated",
          severity: "success",
        }),
      );
      await dispatch(fetchSettings());
    } catch (err) {
      dispatch(
        showSnackbar({
          message: getErrorMessage(err, "Failed to update sync settings"),
          severity: "error",
        }),
      );
    } finally {
      setIsBusyLocal(false);
    }
  };

  const onDeleteSheetSource = async (payload: {
    mode: "oauth" | "service_account";
    profileName: "POS DATA SHEET";
    deleteType: "soft" | "hard";
    confirmText: string;
  }) => {
    if (!canEdit) return;
    try {
      setIsBusyLocal(true);
      await settingsApi.deleteGoogleSheetsSourceBinding(payload);
      dispatch(
        showSnackbar({
          message:
            payload.deleteType === "hard"
              ? "Hard reset completed. Google Sheets configuration and imported rows were removed."
              : "Soft reset completed. Configuration removed and existing data kept.",
          severity: "success",
        }),
      );
      await dispatch(fetchSettings());
    } catch (err) {
      dispatch(
        showSnackbar({
          message: getErrorMessage(err, "Failed to delete source"),
          severity: "error",
        }),
      );
    } finally {
      setIsBusyLocal(false);
    }
  };

  const onSaveSharedConfig = async () => {
    if (!canEdit) return;
    if (!sharedSpreadsheetId.trim()) {
      dispatch(
        showSnackbar({
          message: "Spreadsheet ID is required",
          severity: "error",
        }),
      );
      return;
    }
    try {
      await dispatch(
        configureSharedSheetThunk({
          profileId: defaultSharedProfile?.profileId,
          profileName: defaultSharedProfile?.name ?? "POS DATA SHEET",
          spreadsheetId: sharedSpreadsheetId.trim(),
          sheetName: sharedSheetName.trim() || "Sheet1",
          headerRow: sharedHeaderRow,
          enabled: true,
        }),
      ).unwrap();
    } catch (err) {
      dispatch(
        showSnackbar({
          message: getErrorMessage(err, "Failed to save shared sheet config"),
          severity: "error",
        }),
      );
    }
  };

  const onVerifySharedConfig = async () => {
    if (!canEdit) return;
    try {
      await dispatch(verifySharedSheetThunk({ profileId: defaultSharedProfile?.profileId })).unwrap();
    } catch (err) {
      dispatch(
        showSnackbar({
          message: getErrorMessage(err, "Shared sheet verify failed"),
          severity: "error",
        }),
      );
    }
  };

  const onCheckOAuthStatus = () => {
    void dispatch(fetchOAuthStatus());
  };

  const onToggleUpdateDbWithSheet = async (enabled: boolean) => {
    if (!canEdit) return;
    if (!sharedSpreadsheetId.trim()) {
      dispatch(
        showSnackbar({
          message: "Save a spreadsheet first, then enable Update DB with sheet.",
          severity: "warning",
        }),
      );
      return;
    }
    try {
      await dispatch(
        configureSharedSheetThunk({
          profileId: defaultSharedProfile?.profileId,
          profileName: defaultSharedProfile?.name ?? "POS DATA SHEET",
          spreadsheetId: sharedSpreadsheetId.trim(),
          sheetName: sharedSheetName.trim() || "Sheet1",
          headerRow: sharedHeaderRow,
          enabled,
        }),
      ).unwrap();
      dispatch(
        showSnackbar({
          message: enabled
            ? "Update DB with sheet enabled. Scheduled sync will run for this sheet."
            : "Update DB with sheet disabled.",
          severity: "success",
        }),
      );
    } catch (err) {
      dispatch(
        showSnackbar({
          message: getErrorMessage(err, "Failed to update setting"),
          severity: "error",
        }),
      );
    }
  };

  const onConnectQuickbooks = async () => {
    if (!canEdit) return;
    try {
      setIsBusyLocal(true);
      const response = await settingsApi.connectQuickbooks("/dashboard/settings");
      const url = (response.data as { data?: { url?: string } })?.data?.url;
      if (!url) {
        throw new Error("Missing QuickBooks OAuth URL");
      }
      if (typeof window !== "undefined") {
        window.location.href = url;
      }
    } catch (err) {
      dispatch(
        showSnackbar({
          message: getErrorMessage(err, "QuickBooks connect failed"),
          severity: "error",
        }),
      );
    } finally {
      setIsBusyLocal(false);
    }
  };

  const onQuickbooksEnvironment = async (value: "sandbox" | "production") => {
    if (!canEdit) return;
    try {
      setIsBusyLocal(true);
      await settingsApi.setQuickbooks({ environment: value });
      dispatch(
        showSnackbar({
          message: "QuickBooks environment updated",
          severity: "success",
        }),
      );
      await dispatch(fetchSettings());
    } catch (err) {
      dispatch(
        showSnackbar({
          message: getErrorMessage(err, "QuickBooks update failed"),
          severity: "error",
        }),
      );
    } finally {
      setIsBusyLocal(false);
    }
  };

  const onDisconnectQuickbooks = async () => {
    if (!canEdit) return;
    try {
      setIsBusyLocal(true);
      await settingsApi.disconnectQuickbooks();
      dispatch(
        showSnackbar({
          message: "QuickBooks disconnected",
          severity: "success",
        }),
      );
      await dispatch(fetchSettings());
    } catch (err) {
      dispatch(
        showSnackbar({
          message: getErrorMessage(err, "Failed to disconnect QuickBooks"),
          severity: "error",
        }),
      );
    } finally {
      setIsBusyLocal(false);
    }
  };

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
      const previewRes = await posApi.previewSheet({
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
                onSettingsRefetch={async () => { await dispatch(fetchSettings()); }}
                onSyncNow={onSyncNow}
                onSaveSyncSchedule={onSaveSyncSchedule}
                onDeleteSource={onDeleteSheetSource}
                onDebug={(mode) => { void runDebug(mode); }}
                initialExpandConfigureSection={expandGoogleConfigureSection}
                onConsumedExpandConfigure={() => setExpandGoogleConfigureSection(false)}
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
                        onChange={(
                          _e,
                          value: "sandbox" | "production" | null,
                        ) => {
                          if (!value || !canEdit || isBusy) return;
                          void onQuickbooksEnvironment(value);
                        }}
                      >
                        <ToggleButton value="sandbox">Sandbox</ToggleButton>
                        <ToggleButton value="production">
                          Production
                        </ToggleButton>
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
