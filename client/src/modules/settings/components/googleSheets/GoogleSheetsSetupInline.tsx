import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  FormControlLabel,
  IconButton,
  LinearProgress,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from "@mui/material";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import GridOnIcon from "@mui/icons-material/GridOn";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import { useEffect, useMemo, useState } from "react";
import { settingsApi } from '../../api';
import { posApi } from '../../../pos/api';
import { MatchingWizard } from "../../../pos/components";
import type { GoogleSheetsSettings } from "./GoogleSheetsIntegrationCard";

const SHEET_PROFILE_OPTIONS = ["POS DATA SHEET"] as const;
type SheetProfileName = (typeof SHEET_PROFILE_OPTIONS)[number];

const TARGET_FIELDS = [
  "date",
  "day",
  "highTax",
  "lowTax",
  "saleTax",
  "totalSales",
  "gas",
  "lottery",
  "creditCard",
  "lotteryPayout",
  "clTotal",
  "cash",
  "cashPayout",
  "cashExpenses",
  "notes",
];

const REQUIRED_TARGET_FIELDS = [
  "date",
  "highTax",
  "lowTax",
  "saleTax",
  "gas",
  "lottery",
  "creditCard",
  "lotteryPayout",
  "cashExpenses",
];

const TARGET_LABELS: Record<string, string> = {
  date: "Date",
  highTax: "High Tax",
  lowTax: "Low Tax",
  saleTax: "Sale Tax",
  gas: "Gas",
  lottery: "Lottery",
  creditCard: "Credit Card",
  lotteryPayout: "Lottery Payout",
  cashExpenses: "Cash Expenses",
};

const normalizeTargetValue = (target: string) => {
  const trimmed = String(target ?? "").trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("custom:")) {
    return `custom:${trimmed.replace(/^custom:/, "").trim().toLowerCase()}`;
  }
  return trimmed.toLowerCase();
};

const getDuplicateTargets = (nextMapping: Record<string, string>) => {
  const counts = new Map<string, number>();
  for (const value of Object.values(nextMapping)) {
    if (!value) continue;
    const key = normalizeTargetValue(value);
    if (!key) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .filter(([, count]) => count > 1)
    .map(([key]) => key);
};

type TabInfo = { title: string; rowCount: number | null; columnCount: number | null };
type SheetFile = { id: string; name: string; modifiedTime: string | null };
type Suggestion = { col: string; header: string; suggestion: string; score: number };
type SyncState = { percent: number; stage: string } | null;
type DerivedFieldKey = "day" | "totalSales" | "cash" | "clTotal" | "cashPayout";
const DERIVED_FIELDS: Array<{ key: DerivedFieldKey; label: string }> = [
  { key: "day", label: "Day" },
  { key: "totalSales", label: "Total Sales" },
  { key: "cash", label: "Cash" },
  { key: "clTotal", label: "CL Total" },
  { key: "cashPayout", label: "Cash Payout" },
];

type Props = {
  mode: "oauth" | "service_account";
  settings: GoogleSheetsSettings;
  canEdit: boolean;
  isBusy: boolean;
  lockedProfileName?: SheetProfileName;
  onOpenSyncSetup?: () => void;
  onDebug?: (mode: "oauth" | "shared") => void;
  onRequestDeleteSource?: (payload: {
    mode: "oauth" | "service_account";
    profileName: SheetProfileName;
  }) => void;
  onSaved: () => Promise<void> | void;
};

export const GoogleSheetsSetupInline = ({
  mode,
  settings,
  canEdit,
  isBusy,
  lockedProfileName,
  onOpenSyncSetup,
  onDebug,
  onRequestDeleteSource,
  onSaved,
}: Props) => {
  const [step, setStep] = useState<"pick_profile" | "pick_sheet" | "tabs" | "mapping">(
    lockedProfileName ? "pick_sheet" : "pick_profile",
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncState, setSyncState] = useState<SyncState>(null);

  const [oauthFiles, setOauthFiles] = useState<SheetFile[]>([]);
  const [sharedFiles, setSharedFiles] = useState<SheetFile[]>([]);
  const [selectedSheet, setSelectedSheet] = useState<{ id: string; name: string } | null>(null);
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
  const [selectedProfileName, setSelectedProfileName] = useState<SheetProfileName>(
    lockedProfileName ?? "POS DATA SHEET",
  );
  const [tabs, setTabs] = useState<TabInfo[]>([]);
  const [selectedTab, setSelectedTab] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [sampleRows, setSampleRows] = useState<string[][]>([]);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [transforms, setTransforms] = useState<Record<string, unknown>>({});
  const [selectedDerivedFields, setSelectedDerivedFields] = useState<DerivedFieldKey[]>(
    DERIVED_FIELDS.map((field) => field.key),
  );
  const [rowErrors, setRowErrors] = useState<Array<{ rowIndex: number; errors: Array<{ col: string; message: string }> }>>([]);
  const [showFileList, setShowFileList] = useState(false);
  const [previewView, setPreviewView] = useState<"table" | "json">("table");
  const sharedSheets = settings.sharedSheets ?? [];
  const selectedSharedProfile = sharedSheets.find(
    (sheet) => sheet.name.trim().toUpperCase() === selectedProfileName,
  );
  const selectedOAuthSource = settings.sources.find(
    (source) => source.name.trim().toUpperCase() === selectedProfileName,
  );
  const savedMap = useMemo(() => {
    if (mode === "oauth") {
      return selectedOAuthSource?.mapping ?? {};
    }
    return selectedSharedProfile?.columnsMap ?? selectedSharedProfile?.lastMapping?.columnsMap ?? {};
  }, [mode, selectedOAuthSource?.mapping, selectedSharedProfile?.columnsMap, selectedSharedProfile?.lastMapping?.columnsMap]);
  const isPosProfile = selectedProfileName === "POS DATA SHEET";
  const savedMapEntries = useMemo(() => Object.entries(savedMap), [savedMap]);
  const savedTransforms = useMemo(() => {
    if (mode === "oauth") {
      return (selectedOAuthSource?.transformations as Record<string, unknown> | undefined) ?? {};
    }
    return (selectedSharedProfile?.lastMapping?.transformations as Record<string, unknown> | undefined) ?? {};
  }, [mode, selectedOAuthSource?.transformations, selectedSharedProfile?.lastMapping?.transformations]);
  const selectedDerivedFromSaved = useMemo(() => {
    const raw = (savedTransforms as Record<string, unknown>).__derivedFields;
    if (!Array.isArray(raw)) return DERIVED_FIELDS.map((field) => field.key);
    const selected = raw
      .map((value) => String(value))
      .filter((value): value is DerivedFieldKey => DERIVED_FIELDS.some((field) => field.key === value));
    return selected.length > 0 ? selected : DERIVED_FIELDS.map((field) => field.key);
  }, [savedTransforms]);

  const parseRangeTab = (range?: string) => {
    if (!range) return "";
    const tab = range.split("!")[0]?.trim();
    return tab ? tab.replace(/^'/, "").replace(/'$/, "") : "";
  };

  const loadFiles = async () => {
    setBusy(true);
    setError(null);
    try {
      if (mode === "oauth") {
        const res = await settingsApi.listOAuthSpreadsheets();
        const files = (res.data?.data?.files ?? []) as SheetFile[];
        setOauthFiles(files);
        if (files.length === 0) setError("No spreadsheets found for this Google account.");
      } else {
        const res = await settingsApi.listSharedSpreadsheets();
        const files = (res.data?.data?.files ?? []) as SheetFile[];
        setSharedFiles(files);
        if (files.length === 0) {
          setError("No spreadsheets available for this store.");
        }
      }
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? "Failed to list spreadsheets";
      setError(msg);
    } finally {
      setBusy(false);
    }
  };

  const loadTabs = async (spreadsheetId: string) => {
    setBusy(true);
    setError(null);
    try {
      const res = await settingsApi.listTabsWithSpreadsheetId({
        spreadsheetId,
        authMode: mode === "oauth" ? "oauth" : "service_account",
      });
      const loaded = ((res.data as { data?: { tabs?: TabInfo[] } })?.data?.tabs ?? []) as TabInfo[];
      setTabs(loaded);
      if (loaded.length > 0) setSelectedTab(loaded[0].title);
      return loaded;
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? "Failed to load tabs";
      setError(msg);
      return [];
    } finally {
      setBusy(false);
    }
  };

  const loadPreview = async (tabName: string) => {
    if (!selectedSheet?.id) return;
    setBusy(true);
    setError(null);
    try {
      const source = mode === "oauth" ? "oauth" : "service";
      const res = await posApi.previewSheet({
        source,
        tab: tabName,
        maxRows: 20,
        spreadsheetId: selectedSheet.id,
        headerRow: 1,
      });
      const data = res.data.data as { header: string[]; sampleRows: string[][]; suggestions: Suggestion[] };
      if (!data.header?.length) {
        setError("No columns found. Check the header row.");
        return;
      }
      setHeaders(data.header);
      setSampleRows(data.sampleRows ?? []);
      setSuggestions(data.suggestions ?? []);
      const suggested = Object.fromEntries((data.suggestions ?? []).map((s) => [s.header, s.suggestion]));
      setMapping({ ...suggested, ...(Object.keys(savedMap).length > 0 ? savedMap : {}) });
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? "Preview failed.";
      setError(msg);
    } finally {
      setBusy(false);
    }
  };

  const resetSelectionState = () => {
    setTabs([]);
    setSelectedTab("");
    setHeaders([]);
    setSampleRows([]);
    setSuggestions([]);
    setMapping({});
    setTransforms({});
    setSelectedDerivedFields(DERIVED_FIELDS.map((field) => field.key));
    setRowErrors([]);
    setSyncState(null);
  };

  const hydrateExistingForProfile = (profileName: SheetProfileName) => {
    resetSelectionState();
    if (mode === "oauth") {
      const oauthSource = settings.sources.find(
        (source) => source.name.trim().toUpperCase() === profileName,
      );
      if (oauthSource?.spreadsheetId) {
        setSelectedSheet({
          id: oauthSource.spreadsheetId,
          name: oauthSource.spreadsheetTitle || oauthSource.name,
        });
        setSelectedTab(parseRangeTab(oauthSource.range));
        setShowFileList(false);
      } else {
        setSelectedSheet(null);
        setShowFileList(true);
      }
      return;
    }

    const profile = sharedSheets.find(
      (sheet) => sheet.name.trim().toUpperCase() === profileName,
    );
    if (profile?.spreadsheetId) {
      setSelectedSheet({
        id: profile.spreadsheetId,
        name: profile.spreadsheetTitle || profile.name,
      });
      setSelectedTab(profile.sheetName || "");
      setShowFileList(false);
    } else {
      setSelectedSheet(null);
      setShowFileList(true);
    }
  };

  const handlePickProfile = (profileName: SheetProfileName) => {
    if (lockedProfileName) return;
    setSelectedProfileName(profileName);
    setError(null);
    hydrateExistingForProfile(profileName);
    setStep("pick_sheet");
  };

  useEffect(() => {
    if (!lockedProfileName) return;
    setSelectedProfileName(lockedProfileName);
    setError(null);
    hydrateExistingForProfile(lockedProfileName);
    setStep("pick_sheet");
  }, [lockedProfileName, mode]);

  useEffect(() => {
    if (step === "pick_sheet" && showFileList) void loadFiles();
  }, [step, mode, showFileList]);

  useEffect(() => {
    if (mode === "service_account") {
      const profile = sharedSheets.find((sheet) => sheet.name.toUpperCase() === selectedProfileName);
      setSelectedProfileId(profile?.profileId ?? null);
      return;
    }
    setSelectedProfileId(null);
  }, [mode, sharedSheets, selectedProfileName]);

  useEffect(() => {
    if (step === "mapping" && selectedTab && selectedSheet?.id) void loadPreview(selectedTab);
  }, [step, selectedTab, selectedSheet?.id]);

  useEffect(() => {
    setSelectedDerivedFields(selectedDerivedFromSaved);
  }, [selectedDerivedFromSaved]);

  useEffect(() => {
    if (step !== "pick_sheet") return;
    if (!selectedSheet?.id || !selectedTab) return;
    if (savedMapEntries.length === 0) return;
    if (headers.length > 0 && sampleRows.length > 0) return;
    void loadPreview(selectedTab);
  }, [step, selectedSheet?.id, selectedTab, savedMapEntries.length, headers.length, sampleRows.length]);

  const handleSelectSheet = async (id: string, name: string) => {
    setSelectedSheet({ id, name });
    const loaded = await loadTabs(id);
    if (loaded.length > 0) {
      setSelectedTab(loaded[0].title);
      setStep("tabs");
    }
  };

  const handleSelectTab = (tabTitle: string) => {
    setSelectedTab(tabTitle);
    setStep("mapping");
  };

  const runInstantSync = async () => {
    if (!isPosProfile) return;
    let timer: ReturnType<typeof setInterval> | null = null;
    try {
      setSyncState({ percent: 12, stage: "Starting sync..." });
      timer = setInterval(() => {
        setSyncState((current) => {
          if (!current || current.percent >= 90) return current;
          return { ...current, percent: Math.min(90, current.percent + 8) };
        });
      }, 350);

      const effectiveMapping =
        Object.keys(mapping).length > 0
          ? mapping
          : Object.keys(savedMap).length > 0
            ? savedMap
            : {};
      const effectiveTransforms = {
        ...savedTransforms,
        ...transforms,
        __derivedFields: selectedDerivedFields,
      };
      if (Object.keys(effectiveMapping).length === 0) {
        setError("No saved mapping found. Save mapping before sync.");
        setSyncState(null);
        return;
      }
      const payload =
        mode === "oauth"
          ? {
              mapping: effectiveMapping,
              transforms: effectiveTransforms,
              options: {
                mode: "oauth",
                profileName: selectedProfileName,
                sourceId: selectedOAuthSource?.sourceId,
                spreadsheetId: selectedSheet?.id,
                tab: selectedTab,
                headerRow: 1,
              },
            }
          : {
              mapping: effectiveMapping,
              transforms: effectiveTransforms,
              options: {
                mode: "service_account",
                profileId: selectedProfileId ?? undefined,
                profileName: selectedProfileName,
                tab: selectedTab,
                headerRow: 1,
              },
            };
      const res = await posApi.commitImport(payload);
      const imported = Number(res.data?.data?.result?.imported ?? 0);
      setSyncState({
        percent: 100,
        stage: `Sync complete. Processed ${imported} rows.`,
      });
      window.setTimeout(() => setSyncState(null), 1800);
    } finally {
      if (timer) clearInterval(timer);
    }
  };

  const handleSaveMapping = async () => {
    const mappedCount = Object.values(mapping).filter(Boolean).length;
    if (mappedCount === 0) {
      setError("Map at least one column.");
      return;
    }
    const duplicateTargets = getDuplicateTargets(mapping);
    if (duplicateTargets.length > 0) {
      setError(
        `One-to-one mapping required. Remove duplicates: ${duplicateTargets
          .map((field) => TARGET_LABELS[field] ?? field)
          .join(", ")}.`,
      );
      return;
    }
    const mappedTargets = new Set(Object.values(mapping).filter(Boolean));
    const missing = REQUIRED_TARGET_FIELDS.filter((t) => !mappedTargets.has(t));
    if (missing.length > 0) {
      setError(
        `Please map required fields: ${missing
          .map((field) => TARGET_LABELS[field] ?? field)
          .join(", ")}.`,
      );
      return;
    }
    setBusy(true);
    setError(null);
    setRowErrors([]);
    try {
      const transformsPayload: Record<string, unknown> = {
        ...transforms,
        __derivedFields: selectedDerivedFields,
      };
      const res = await posApi.validateMapping({
        mapping,
        transforms: transformsPayload,
        validateSample: true,
        tab: selectedTab,
        spreadsheetId: selectedSheet?.id ?? undefined,
        headerRow: 1,
      });
      const data = res.data.data as { valid: boolean; rowErrors: typeof rowErrors };
      setRowErrors(data.rowErrors ?? []);
      if (!data.valid) {
        setError(`Validation found ${(data.rowErrors?.length ?? 0)} issue(s). Fix mapping and retry.`);
        return;
      }
      if (mode === "oauth") {
        if (!selectedSheet?.id || !selectedTab) {
          setError("Select spreadsheet and tab first.");
          return;
        }
        await settingsApi.saveGoogleSource({
          sourceId: selectedOAuthSource?.sourceId,
          name: selectedProfileName,
          spreadsheetTitle: selectedSheet.name,
          spreadsheetId: selectedSheet.id,
          range: `${selectedTab}!A1:Z`,
          mapping,
          transformations: transformsPayload,
          active: selectedProfileName === "POS DATA SHEET",
        });
      } else {
        await settingsApi.saveGoogleSheetsMapping({
          mode: "service_account",
          profileId: selectedProfileId ?? undefined,
          profileName: selectedProfileName,
          columnsMap: mapping,
          transformations: transformsPayload,
        });
      }
      if (mode === "service_account" && selectedSheet?.id) {
        await settingsApi.configureSharedSheet({
          profileId: selectedProfileId ?? undefined,
          profileName: selectedProfileName,
          spreadsheetId: selectedSheet.id,
          sheetName: selectedTab,
          headerRow: 1,
          enabled: true,
        });
      }
      await runInstantSync();
      await onSaved();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? "Save failed";
      setError(msg);
      setSyncState(null);
    } finally {
      setBusy(false);
    }
  };

  const files = mode === "oauth" ? oauthFiles : sharedFiles;
  const isOAuthDisconnected = mode === "oauth" && !settings.connected;
  const mappingPreviewRows = savedMapEntries.map(([sheetField, dbField]) => {
    const idx = headers.findIndex((h) => h === sheetField);
    const value = idx >= 0 ? sampleRows[0]?.[idx] ?? "—" : "—";
    return { dbField, sheetField, value };
  });
  const sheetUrl = selectedSheet?.id
    ? `https://docs.google.com/spreadsheets/d/${selectedSheet.id}/edit`
    : null;
  const copySheetUrl = async () => {
    if (!sheetUrl) return;
    try {
      await navigator.clipboard.writeText(sheetUrl);
    } catch {
      // noop
    }
  };
  const sheetInfoJson = {
    mode,
    profile: selectedProfileName,
    sheetName: selectedSheet?.name ?? null,
    tabName: selectedTab || null,
    spreadsheetId: selectedSheet?.id ?? null,
    mappedCount: savedMapEntries.length,
    mapping: mappingPreviewRows,
  };

  return (
    <Stack spacing={3}>
      {error && (
        <Alert severity="error" onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {syncState && (
        <Paper variant="outlined" sx={{ px: 2, py: 1.5 }}>
          <Stack spacing={1}>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              {syncState.stage}
            </Typography>
            <LinearProgress variant="determinate" value={syncState.percent} />
            <Typography variant="caption" color="text.secondary">
              {syncState.percent < 100 ? "Working..." : "Done"}
            </Typography>
          </Stack>
        </Paper>
      )}

      {!lockedProfileName && step === "pick_profile" && (
        <Stack spacing={1.25}>
          <Typography variant="subtitle2" fontWeight={600}>
            Select sheet profile
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Choose which profile you want to configure.
          </Typography>
          <Stack direction="row" spacing={1} flexWrap="wrap">
            {SHEET_PROFILE_OPTIONS.map((profileName) => {
              const oauthSource = settings.sources.find(
                (source) => source.name.trim().toUpperCase() === profileName,
              );
              const sharedProfile = sharedSheets.find(
                (sheet) => sheet.name.trim().toUpperCase() === profileName,
              );
              const configured =
                mode === "oauth"
                  ? Boolean(oauthSource?.spreadsheetId)
                  : Boolean(sharedProfile?.spreadsheetId);
              return (
                <Chip
                  key={profileName}
                  color={configured ? "success" : "default"}
                  variant="outlined"
                  label={`${profileName}${configured ? " · Configured" : " · Not configured"}`}
                  onClick={() => handlePickProfile(profileName)}
                  sx={{ cursor: "pointer" }}
                />
              );
            })}
          </Stack>
        </Stack>
      )}

      {step === "pick_sheet" && (
        <>
          {isOAuthDisconnected && (
            <Paper variant="outlined" sx={{ p: 2 }}>
              <Stack spacing={1.25}>
                <Typography variant="subtitle2" fontWeight={700}>
                  OAuth login is disabled for this flow
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Use <strong>Shared</strong> source for company-shared spreadsheets. OAuth connect is no longer required here.
                </Typography>
              </Stack>
            </Paper>
          )}

          {!isOAuthDisconnected && !selectedSheet?.id && !showFileList && (
            <Paper variant="outlined" sx={{ position: "relative", overflow: "hidden" }}>
              <Box sx={{ p: 2, filter: "blur(2px)", opacity: 0.7 }}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>DB Field</TableCell>
                      <TableCell>Sheet Field</TableCell>
                      <TableCell>Value</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {[1, 2, 3].map((n) => (
                      <TableRow key={n}>
                        <TableCell>date</TableCell>
                        <TableCell>Column {n}</TableCell>
                        <TableCell>—</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Box>
              <Box
                sx={{
                  position: "absolute",
                  inset: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  bgcolor: "rgba(255,255,255,0.45)",
                }}
              >
                <Button
                  variant="contained"
                  onClick={() => setShowFileList(true)}
                  disabled={busy || !canEdit}
                >
                  Select sheet
                </Button>
              </Box>
            </Paper>
          )}

          {!isOAuthDisconnected && selectedSheet?.id && (
            <Paper variant="outlined" sx={{ p: 1.5 }}>
              <Stack spacing={1}>
                <Stack
                  direction={{ xs: "column", md: "row" }}
                  justifyContent="space-between"
                  alignItems={{ xs: "flex-start", md: "flex-start" }}
                  spacing={2}
                >
                  <Stack spacing={0.75} sx={{ minWidth: 0 }}>
                    <Typography variant="subtitle2">Sheet information</Typography>
                    <Typography variant="body2">
                      <strong>Sheet name:</strong> {selectedSheet.name}
                    </Typography>
                    <Typography variant="body2">
                      <strong>Tab name:</strong> {selectedTab || "—"}
                    </Typography>
                    <Typography variant="body2" sx={{ wordBreak: "break-all" }}>
                      <strong>Spreadsheet ID:</strong> {selectedSheet.id}
                    </Typography>
                    {sheetUrl ? (
                      <Stack spacing={0.5}>
                        <Typography variant="body2">
                          <strong>Sheet URL:</strong>
                        </Typography>
                        <Stack direction="row" spacing={0.5} alignItems="center" sx={{ minWidth: 0 }}>
                          <Typography
                            variant="caption"
                            title={sheetUrl}
                            sx={{
                              flex: 1,
                              minWidth: 0,
                              fontFamily: "monospace",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {sheetUrl}
                          </Typography>
                          <Tooltip title="Copy URL">
                            <span>
                              <IconButton size="small" onClick={() => void copySheetUrl()}>
                                <ContentCopyIcon fontSize="inherit" />
                              </IconButton>
                            </span>
                          </Tooltip>
                          <Tooltip title="Open sheet">
                            <IconButton
                              size="small"
                              component="a"
                              href={sheetUrl}
                              target="_blank"
                              rel="noreferrer"
                            >
                              <OpenInNewIcon fontSize="inherit" />
                            </IconButton>
                          </Tooltip>
                        </Stack>
                      </Stack>
                    ) : null}
                  </Stack>
                  <Stack
                    direction="column"
                    spacing={1}
                    sx={{ width: { xs: "100%", md: "auto" }, flexWrap: "wrap" }}
                  >
                    <Button
                      size="small"
                      variant="outlined"
                      onClick={onOpenSyncSetup}
                      disabled={busy || isBusy || !canEdit}
                      sx={{ width: { xs: "100%", md: 180 } }}
                    >
                      Sync settings
                    </Button>
                    <Button
                      size="small"
                      variant="outlined"
                      onClick={() => onDebug?.(mode === "oauth" ? "oauth" : "shared")}
                      disabled={busy || isBusy}
                      sx={{ width: { xs: "100%", md: 180 } }}
                    >
                      Debug
                    </Button>
                    <Button
                      size="small"
                      variant="outlined"
                      onClick={() => {
                        setError(null);
                        setStep("pick_sheet");
                        setShowFileList(true);
                      }}
                      disabled={busy || isBusy || !canEdit}
                      sx={{ width: { xs: "100%", md: 180 } }}
                    >
                      Change sheet settings
                    </Button>
                    <Button
                      size="small"
                      variant="outlined"
                      color="error"
                      onClick={() =>
                        onRequestDeleteSource?.({
                          mode,
                          profileName: selectedProfileName,
                        })
                      }
                      disabled={busy || isBusy || !canEdit}
                      sx={{ width: { xs: "100%", md: 180 } }}
                    >
                      Delete
                    </Button>
                  </Stack>
                </Stack>
                <Stack direction="row" justifyContent="space-between" alignItems="center">
                  <Typography variant="subtitle2">Mapping information</Typography>
                  <ToggleButtonGroup
                    size="small"
                    exclusive
                    value={previewView}
                    onChange={(_e, value: "table" | "json" | null) => {
                      if (!value) return;
                      setPreviewView(value);
                    }}
                  >
                    <ToggleButton value="table">Table</ToggleButton>
                    <ToggleButton value="json">JSON</ToggleButton>
                  </ToggleButtonGroup>
                </Stack>
                {previewView === "table" ? (
                  <Stack spacing={1}>
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell>DB Field</TableCell>
                          <TableCell>Sheet Field</TableCell>
                          <TableCell>Value</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {mappingPreviewRows.length > 0 ? (
                          mappingPreviewRows.map((entry) => (
                            <TableRow key={`${entry.dbField}-${entry.sheetField}`}>
                              <TableCell>{entry.dbField}</TableCell>
                              <TableCell>{entry.sheetField}</TableCell>
                              <TableCell>{entry.value || "—"}</TableCell>
                            </TableRow>
                          ))
                        ) : (
                          <TableRow>
                            <TableCell colSpan={3} sx={{ color: "text.secondary" }}>
                              No mapping saved yet.
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </Stack>
                ) : (
                  <Box
                    component="pre"
                    sx={{
                      m: 0,
                      p: 1.5,
                      borderRadius: 1,
                      bgcolor: "action.hover",
                      fontSize: 12,
                      overflowX: "auto",
                    }}
                  >
                    {JSON.stringify(sheetInfoJson, null, 2)}
                  </Box>
                )}
                <Typography variant="caption" color="text.secondary">
                  Showing {savedMapEntries.length} mapping entries.
                </Typography>
              </Stack>
            </Paper>
          )}

          {!isOAuthDisconnected && showFileList && (
            <Paper variant="outlined" sx={{ maxHeight: 280, overflow: "auto" }}>
              {busy && files.length === 0 ? (
                <Stack alignItems="center" py={3}>
                  <CircularProgress size={24} />
                </Stack>
              ) : (
                <List dense disablePadding>
                  {files.map((f) => (
                    <ListItemButton
                      key={f.id}
                      selected={selectedSheet?.id === f.id}
                      onClick={() => void handleSelectSheet(f.id, f.name)}
                      disabled={busy}
                    >
                      <ListItemIcon sx={{ minWidth: 32 }}>
                        <Box component="img" src="/google-sheets-icon.svg" alt="" sx={{ width: 18, height: 18 }} />
                      </ListItemIcon>
                      <ListItemText
                        primary={f.name}
                        secondary={f.modifiedTime ? new Date(f.modifiedTime).toLocaleString() : undefined}
                        primaryTypographyProps={{ variant: "body2", noWrap: true }}
                      />
                    </ListItemButton>
                  ))}
                </List>
              )}
            </Paper>
          )}
        </>
      )}

      {step === "tabs" && selectedSheet && (
        <>
          <Typography variant="subtitle2" fontWeight={600}>
            Sheet & tab
          </Typography>
          <Stack direction="row" justifyContent="space-between" alignItems="center">
            <Typography variant="body2" color="text.secondary">
              Sheet: <strong>{selectedSheet.name}</strong>. Select a tab.
            </Typography>
            <Button size="small" variant="text" onClick={() => setStep("pick_sheet")} disabled={busy}>
              Back
            </Button>
          </Stack>
          <Paper variant="outlined" sx={{ maxHeight: 280, overflow: "auto" }}>
            <List dense disablePadding>
              {tabs.map((tab) => (
                <ListItemButton
                  key={tab.title}
                  selected={selectedTab === tab.title}
                  onClick={() => handleSelectTab(tab.title)}
                  disabled={busy}
                >
                  <ListItemIcon sx={{ minWidth: 32 }}>
                    <GridOnIcon fontSize="small" color={selectedTab === tab.title ? "primary" : "action"} />
                  </ListItemIcon>
                  <ListItemText
                    primary={tab.title}
                    secondary={tab.rowCount != null ? `${tab.rowCount} rows` : undefined}
                    primaryTypographyProps={{ variant: "body2" }}
                  />
                </ListItemButton>
              ))}
            </List>
          </Paper>
        </>
      )}

      {step === "mapping" && (
        <>
          <Typography variant="subtitle2" fontWeight={600}>
            Field mapping
          </Typography>
          <Stack direction="row" justifyContent="space-between" alignItems="center">
            <Typography variant="body2" color="text.secondary">
              Tab <strong>{selectedTab}</strong>. Map sheet columns to POS fields.
            </Typography>
            <Button size="small" variant="text" onClick={() => setStep("tabs")} disabled={busy}>
              Back
            </Button>
          </Stack>
          {headers.length > 0 && (
            <MatchingWizard
              headers={headers}
              sampleRows={sampleRows}
              suggestions={suggestions}
              mapping={mapping}
              transforms={transforms}
              targetFields={TARGET_FIELDS}
              rowErrors={rowErrors}
              onChangeMapping={setMapping}
              onChangeTransforms={setTransforms}
            />
          )}
          <Paper variant="outlined" sx={{ p: 1.5 }}>
            <Stack spacing={1}>
              <Typography variant="subtitle2">Derived calculated fields</Typography>
              <Typography variant="caption" color="text.secondary">
                Select which calculated fields should be marked as applied for this sheet mapping.
              </Typography>
              <Stack direction="row" spacing={1} flexWrap="wrap">
                {DERIVED_FIELDS.map((field) => (
                  <FormControlLabel
                    key={field.key}
                    sx={{ mr: 2 }}
                    control={
                      <Checkbox
                        size="small"
                        checked={selectedDerivedFields.includes(field.key)}
                        onChange={(_e, checked) =>
                          setSelectedDerivedFields((prev) =>
                            checked
                              ? [...new Set([...prev, field.key])]
                              : prev.filter((entry) => entry !== field.key),
                          )
                        }
                      />
                    }
                    label={<Typography variant="body2">{field.label}</Typography>}
                  />
                ))}
              </Stack>
            </Stack>
          </Paper>
          <Stack direction="row" spacing={1}>
            <Button variant="contained" onClick={handleSaveMapping} disabled={busy || !canEdit}>
              {busy ? "Saving…" : "Save mapping"}
            </Button>
            <Button variant="outlined" onClick={() => setStep("tabs")} disabled={busy}>
              Back
            </Button>
          </Stack>
        </>
      )}
    </Stack>
  );
};
