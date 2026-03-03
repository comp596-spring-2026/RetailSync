import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Collapse,
  Divider,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  MenuItem,
  Paper,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import SyncAltIcon from "@mui/icons-material/SyncAlt";
import LinkIcon from "@mui/icons-material/Link";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import SettingsIcon from "@mui/icons-material/Settings";
import { Fragment, useEffect, useMemo, useState } from "react";
import { settingsApi } from "../../api";
import type { GoogleSheetMode } from '../../api';
import { GoogleSheetsSetupInline } from "./GoogleSheetsSetupInline";
import { MappingModal } from "./MappingModal";
import {
  getActiveSource,
  getBackendActiveSource,
  getSourceStatusOAuth,
  getSourceStatusShared,
  getSummaryModel,
  type SourceStatus,
  type SourceType,
} from "./googleSheetsStatus";

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
    connectorLabel?: string;
    spreadsheetTitle?: string | null;
    spreadsheetId: string;
    sheetGid: string | null;
    range: string;
    mapping: Record<string, string>;
    transformations?: Record<string, unknown>;
    mappingConfirmedAt?: string | null;
    mappingHash?: string | null;
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
    connectorLabel?: string;
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
    mappingConfirmedAt?: string | null;
    mappingHash?: string | null;
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
const MODE_BY_PROFILE_STORAGE_KEY = "retailsync.settings.sourceModeByProfile";
const MAPPING_CONFIRM_STORAGE_KEY = "retailsync.settings.mappingConfirmByProfile";
type WizardOpenRequest = { token: number; startStep: 0 | 1 | 2; sourceType?: SourceType };
type MappingConfirmState = Record<ProfileName, { hash: string; confirmed: boolean }>;

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
const TARGET_FIELD_LABELS: Record<string, string> = {
  date: "Date",
  day: "Day",
  highTax: "High Tax",
  lowTax: "Low Tax",
  saleTax: "Sale Tax",
  totalSales: "Total Sales",
  gas: "Gas",
  lottery: "Lottery",
  creditCard: "Credit Card",
  lotteryPayout: "Lottery Payout (Cash)",
  creditPlusLottery: "Credit + Lottery",
  cashDiff: "Cash Diff",
  cashExpenses: "Cash Expenses",
  notes: "Notes / Description",
};
const parseRangeTab = (range?: string) => {
  if (!range) return "";
  const tab = range.split("!")[0]?.trim();
  return tab ? tab.replace(/^'/, "").replace(/'$/, "") : "";
};
const toUtcOffset = (value: string | null | undefined) =>
  UTC_OFFSET_OPTIONS.some((option) => option.value === value) ? value ?? DEFAULT_SYNC_UTC_OFFSET : DEFAULT_SYNC_UTC_OFFSET;
const readStoredModeByProfile = (): Partial<Record<ProfileName, GoogleSheetMode>> => {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(MODE_BY_PROFILE_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const next: Partial<Record<ProfileName, GoogleSheetMode>> = {};
    for (const profileName of PROFILE_ROWS) {
      const value = parsed[profileName];
      if (value === "oauth" || value === "service_account") {
        next[profileName] = value;
      }
    }
    return next;
  } catch {
    return {};
  }
};

const writeStoredModeByProfile = (value: Partial<Record<ProfileName, GoogleSheetMode>>) => {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(MODE_BY_PROFILE_STORAGE_KEY, JSON.stringify(value));
};

const readStoredMappingConfirm = (): Partial<MappingConfirmState> => {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(MAPPING_CONFIRM_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const next: Partial<MappingConfirmState> = {};
    for (const profileName of PROFILE_ROWS) {
      const entry = parsed[profileName] as Record<string, unknown> | undefined;
      if (!entry) continue;
      next[profileName] = {
        hash: String(entry.hash ?? ""),
        confirmed: Boolean(entry.confirmed),
      };
    }
    return next;
  } catch {
    return {};
  }
};

const writeStoredMappingConfirm = (value: Partial<MappingConfirmState>) => {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(MAPPING_CONFIRM_STORAGE_KEY, JSON.stringify(value));
};

const mappingHash = (mapping: Record<string, string>) =>
  JSON.stringify(
    Object.entries(mapping)
      .filter(([, target]) => Boolean(String(target ?? "").trim()))
      .sort(([left], [right]) => left.localeCompare(right)),
  );

const pickPreferredOAuthSource = (
  sources: GoogleSheetsSettings['sources'],
  profileName: string,
) => {
  const normalized = normalizeName(profileName);
  const activeByName =
    sources.find((source) => source.active && normalizeName(source.name) === normalized) ?? null;
  if (activeByName) return activeByName;

  const activeAny = sources.find((source) => source.active) ?? null;
  if (activeAny && normalizeName(activeAny.name) === normalized) return activeAny;

  return sources.find((source) => normalizeName(source.name) === normalized) ?? activeAny ?? sources[0] ?? null;
};

const pickPreferredSharedProfile = (
  profiles: NonNullable<GoogleSheetsSettings['sharedSheets']>,
  profileName: string,
) => {
  const normalized = normalizeName(profileName);
  const defaultByName =
    profiles.find((profile) => profile.isDefault && normalizeName(profile.name) === normalized) ?? null;
  if (defaultByName) return defaultByName;

  const defaultAny = profiles.find((profile) => profile.isDefault) ?? null;
  if (defaultAny && normalizeName(defaultAny.name) === normalized) return defaultAny;

  return profiles.find((profile) => normalizeName(profile.name) === normalized) ?? defaultAny ?? profiles[0] ?? null;
};

export const GoogleSheetsIntegrationCard = ({
  settings,
  syncOverview = null,
  syncProgress = null,
  canEdit,
  isBusy,
  oauthStatus = null,
  onCheckOAuthStatus,
  onSetActiveMode: _onSetActiveMode,
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
  void syncOverview;
  void syncProgress;

  const shared = settings.sharedConfig;
  const oauthSources = Array.isArray(settings.sources) ? settings.sources : [];
  const sharedSheets = Array.isArray(settings.sharedSheets) ? settings.sharedSheets : [];
  const effectiveMode: GoogleSheetMode = settings.mode === "oauth" ? "oauth" : "service_account";
  const oauthConnected = Boolean(settings.connected);
  // Keep OAuth flow unblocked when connection is established; oauthStatus can lag after callback.
  const oauthTokensPresent = oauthConnected;
  const [expanded, setExpanded] = useState<ProfileName | null>("POS DATA SHEET");
  const inferModeForProfile = (profileName: ProfileName): GoogleSheetMode => {
    const oauthSource = pickPreferredOAuthSource(oauthSources, profileName);
    const sharedProfile = pickPreferredSharedProfile(sharedSheets, profileName);
    const hasOAuth = Boolean(oauthSource?.spreadsheetId);
    const hasShared = Boolean(sharedProfile?.spreadsheetId);
    if (hasOAuth && !hasShared) return "oauth";
    if (hasShared && !hasOAuth) return "service_account";
    return effectiveMode;
  };

  const resolveModeForProfile = (
    profileName: ProfileName,
    preferredMode?: GoogleSheetMode,
  ): GoogleSheetMode => {
    const oauthSource = pickPreferredOAuthSource(oauthSources, profileName);
    const sharedProfile = pickPreferredSharedProfile(sharedSheets, profileName);
    const hasOAuth = Boolean(oauthSource?.spreadsheetId);
    const hasShared = Boolean(sharedProfile?.spreadsheetId);
    if (hasOAuth && !hasShared) return "oauth";
    if (hasShared && !hasOAuth) return "service_account";
    if (preferredMode === "oauth" || preferredMode === "service_account") return preferredMode;
    return inferModeForProfile(profileName);
  };

  const [modeByProfile, setModeByProfile] = useState<Record<ProfileName, GoogleSheetMode>>(() => {
    const stored = readStoredModeByProfile();
    return {
      "POS DATA SHEET": stored["POS DATA SHEET"] ?? inferModeForProfile("POS DATA SHEET"),
    };
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
  const [syncConfirmOpen, setSyncConfirmOpen] = useState(false);
  const [wizardOpenRequest, setWizardOpenRequest] = useState<Record<ProfileName, WizardOpenRequest>>({
    "POS DATA SHEET": { token: 0, startStep: 0 },
  });
  const [mappingConfirmByProfile, setMappingConfirmByProfile] = useState<MappingConfirmState>(() => ({
    "POS DATA SHEET": readStoredMappingConfirm()["POS DATA SHEET"] ?? { hash: "", confirmed: false },
  }));
  const [mappingModalProfile, setMappingModalProfile] = useState<ProfileName | null>(null);

  useEffect(() => {
    setModeByProfile((prev) => {
      const nextMode = resolveModeForProfile("POS DATA SHEET", prev["POS DATA SHEET"]);
      if (prev["POS DATA SHEET"] === nextMode) return prev;
      return {
        ...prev,
        "POS DATA SHEET": nextMode,
      };
    });
  }, [effectiveMode, oauthSources, sharedSheets]);

  useEffect(() => {
    writeStoredModeByProfile(modeByProfile);
  }, [modeByProfile]);

  useEffect(() => {
    writeStoredMappingConfirm(mappingConfirmByProfile);
  }, [mappingConfirmByProfile]);

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

  const rows = useMemo(
    () =>
      PROFILE_ROWS.map((profileName) => {
        const selectedMode = modeByProfile[profileName] ?? effectiveMode;
        const oauthSource = pickPreferredOAuthSource(oauthSources, profileName);
        const sharedProfile = pickPreferredSharedProfile(sharedSheets, profileName);
        const oauthMappedCount = Object.keys(oauthSource?.mapping ?? {}).length;
        const oauthMapping = oauthSource?.mapping ?? {};
        const oauthConfig = {
          sourceId: oauthSource?.sourceId ?? null,
          spreadsheetId: oauthSource?.spreadsheetId ?? null,
          sheetName: parseRangeTab(oauthSource?.range) || "Sheet1",
          headerRow: 1,
          mappedCount: oauthMappedCount,
          connectorLabel: oauthSource?.connectorLabel ?? "POS Daily Summary",
          spreadsheetTitle: oauthSource?.spreadsheetTitle ?? "",
          lastSyncAt: null as string | null,
          enabled: true,
          mapping: oauthMapping,
          transformations: oauthSource?.transformations ?? {},
          mappingConfirmedAt: oauthSource?.mappingConfirmedAt ?? null,
          mappingHash: oauthSource?.mappingHash ?? null,
        };

        const sharedMapping =
          sharedProfile?.columnsMap ?? sharedProfile?.lastMapping?.columnsMap ?? {};
        const sharedMappedCount = Object.keys(
          sharedMapping,
        ).length;
        const sharedConfig = {
          profileId: sharedProfile?.profileId ?? null,
          spreadsheetId: sharedProfile?.spreadsheetId ?? shared?.spreadsheetId ?? null,
          sheetName: sharedProfile?.sheetName ?? shared?.sheetName ?? "Sheet1",
          headerRow: Number(sharedProfile?.headerRow ?? shared?.headerRow ?? 1),
          mappedCount: sharedMappedCount,
          connectorLabel: sharedProfile?.connectorLabel ?? "POS Daily Summary",
          spreadsheetTitle: sharedProfile?.spreadsheetTitle ?? settings.sharedConfig?.spreadsheetTitle ?? "",
          lastSyncAt: (sharedProfile?.lastImportAt ?? shared?.lastImportAt ?? null) as string | null,
          enabled: Boolean(sharedProfile?.enabled ?? shared?.enabled ?? false),
          mapping: sharedMapping,
          transformations:
            (sharedProfile?.lastMapping?.transformations as Record<string, unknown> | undefined) ?? {},
          mappingConfirmedAt: sharedProfile?.mappingConfirmedAt ?? null,
          mappingHash: sharedProfile?.mappingHash ?? null,
        };
        const sharedShareStatus = sharedProfile?.shareStatus ?? shared?.shareStatus ?? "unknown";
        const sharedConfigured =
          Boolean(sharedConfig.spreadsheetId) &&
          sharedShareStatus !== "no_permission" &&
          sharedShareStatus !== "not_shared" &&
          sharedShareStatus !== "not_found";
        const hasOAuthConfig = Boolean(oauthConfig.spreadsheetId) || oauthMappedCount > 0;
        const hasSharedConfig = Boolean(sharedConfig.spreadsheetId) || sharedMappedCount > 0;

        const statuses: Record<SourceType, SourceStatus> = {
          oauth: getSourceStatusOAuth(oauthConfig, oauthTokensPresent),
          shared: getSourceStatusShared(sharedConfig, sharedConfigured),
        };
        const backendActive = getBackendActiveSource(effectiveMode, hasOAuthConfig, hasSharedConfig);
        const activeSource = getActiveSource({ mode: effectiveMode, backendActive }, statuses);
        const summary = getSummaryModel(
          activeSource,
          statuses,
          { oauth: oauthConfig, shared: sharedConfig },
          backendActive,
        );

        const statusText =
          summary.authorityState === "active_ready"
            ? "Completed"
            : summary.authorityState === "paused"
              ? "Paused"
              : "Not configured";
        const sourceText = backendActive ? (backendActive === "oauth" ? "OAuth" : "Shared") : "—";
        const infoConfig =
          summary.authorityState !== "none" && backendActive
            ? (backendActive === "oauth" ? oauthConfig : sharedConfig)
            : null;
        const infoText = infoConfig?.spreadsheetId
          ? `${infoConfig.sheetName || "Sheet1"} (${infoConfig.spreadsheetId.slice(0, 12)}...)`
          : "No spreadsheet selected yet";
        const stagedConfig = selectedMode === "oauth" ? oauthConfig : sharedConfig;
        const lastSyncAt = stagedConfig.lastSyncAt ? new Date(stagedConfig.lastSyncAt).toLocaleString() : "—";
        const activeConfig = backendActive === "oauth" ? oauthConfig : backendActive === "shared" ? sharedConfig : null;
        const activeMapping = (activeConfig?.mapping ?? {}) as Record<string, string>;
        const mappingPairs = Object.entries(activeMapping)
          .filter(([, target]) => Boolean(String(target ?? "").trim()))
          .map(([sheetColumn, target]) => ({
            systemField: TARGET_FIELD_LABELS[String(target)] ?? String(target),
            sheetColumn,
            targetKey: String(target),
          }))
          .sort((left, right) => left.systemField.localeCompare(right.systemField));
        const activeMappingHash = mappingHash(activeMapping);
        const mappedTargets = new Set(Object.values(activeMapping).filter(Boolean));
        const missingRequiredCount = REQUIRED_TARGET_FIELDS.filter((field) => !mappedTargets.has(field)).length;
        const duplicateTargets = (() => {
          const counts = new Map<string, number>();
          for (const value of Object.values(activeMapping)) {
            if (!value) continue;
            const key = String(value).trim().toLowerCase();
            if (!key) continue;
            counts.set(key, (counts.get(key) ?? 0) + 1);
          }
          return Array.from(counts.values()).filter((count) => count > 1).length;
        })();
        const hasAnyConfig =
          hasOAuthConfig ||
          hasSharedConfig ||
          Boolean(oauthTokensPresent) ||
          Boolean(sharedConfigured);

        return {
          profileName,
          selectedMode,
          statusText,
          sourceText,
          infoText,
          mappedCount: stagedConfig.mappedCount,
          spreadsheetTitle: stagedConfig.spreadsheetTitle,
          spreadsheetId: stagedConfig.spreadsheetId ?? "",
          lastSyncAt,
          statuses,
          summary,
          activeSource,
          backendActive,
          oauthConfig,
          sharedConfig,
          activeConfig,
          activeMapping,
          activeMappingHash,
          mappingPairs,
          hasAnyConfig,
          missingRequiredCount,
          duplicateTargets,
        };
      }),
    [effectiveMode, modeByProfile, oauthSources, oauthTokensPresent, shared, sharedSheets],
  );
  const hasConnectedSheet = useMemo(
    () => rows.some((row) => row.activeSource !== null),
    [rows],
  );
  const configuredConnectorCount = rows.filter((row) => row.hasAnyConfig).length;
  const readyConnectorCount = rows.filter((row) => row.summary.authorityState === "active_ready").length;
  const activeSourceLabel = (() => {
    const activeRow = rows.find((row) => row.summary.authorityState === "active_ready");
    if (!activeRow?.activeSource) return "None";
    return activeRow.activeSource === "oauth" ? "OAuth" : "Shared";
  })();
  const latestRowSync = rows
    .map((row) => row.activeConfig?.lastSyncAt ?? null)
    .filter((value): value is string => Boolean(value))
    .sort((left, right) => (left > right ? -1 : 1))[0] ?? null;
  const hasMisconfiguredSource = rows.some((row) => row.summary.isMisconfigured);
  const globalStatusLabel = hasConnectedSheet
    ? "Sync enabled"
    : hasMisconfiguredSource
      ? "Setup required"
      : "Not configured";
  const summaryText =
    readyConnectorCount > 0
      ? `${readyConnectorCount} connector${readyConnectorCount === 1 ? "" : "s"} ready • Active: ${activeSourceLabel} • Last sync: ${
          latestRowSync ? new Date(latestRowSync).toLocaleString() : "—"
        }`
      : "No sheets configured. Set up a sheet to enable syncing.";

  useEffect(() => {
    setMappingConfirmByProfile((prev) => {
      let changed = false;
      const next: MappingConfirmState = { ...prev };

      for (const row of rows) {
        const current = next[row.profileName] ?? { hash: "", confirmed: false };
        const nextHash = row.activeMappingHash;
        const ready = row.summary.authorityState === "active_ready";

        if (!ready || !nextHash) {
          if (current.hash !== "" || current.confirmed) {
            next[row.profileName] = { hash: "", confirmed: false };
            changed = true;
          }
          continue;
        }

        if (current.hash !== nextHash) {
          next[row.profileName] = { hash: nextHash, confirmed: false };
          changed = true;
        }
      }

      return changed ? next : prev;
    });
  }, [rows]);

  const onChangeProfileMode = (profileName: ProfileName, nextMode: GoogleSheetMode) => {
    setModeByProfile((prev) => {
      if (prev[profileName] === nextMode) return prev;
      return { ...prev, [profileName]: nextMode };
    });
  };

  const toggleExpanded = (profileName: ProfileName) => {
    setExpanded((prev) => (prev === profileName ? null : profileName));
  };
  const openWizard = (
    profileName: ProfileName,
    startStep: 0 | 1 | 2,
    sourceType?: SourceType,
  ) => {
    setWizardOpenRequest((prev) => ({
      ...prev,
      [profileName]: {
        token: Date.now(),
        startStep,
        sourceType,
      },
    }));
  };
  const consumeOpenWizardToken = (profileName: ProfileName) => {
    setWizardOpenRequest((prev) => {
      const current = prev[profileName];
      if (!current || current.token === 0) return prev;
      return {
        ...prev,
        [profileName]: {
          ...current,
          token: 0,
        },
      };
    });
  };
  const isMappingConfirmed = (profileName: ProfileName, hash: string) => {
    const entry = mappingConfirmByProfile[profileName];
    return Boolean(entry && entry.confirmed && entry.hash === hash);
  };
  const confirmMapping = (profileName: ProfileName, hash: string) => {
    setMappingConfirmByProfile((prev) => ({
      ...prev,
      [profileName]: { hash, confirmed: true },
    }));
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
  const mappingModalRow = mappingModalProfile
    ? rows.find((entry) => entry.profileName === mappingModalProfile) ?? null
    : null;
  const requestSyncNow = () => {
    if (!onSyncNow) return;
    setSyncConfirmOpen(true);
  };

  const handleConfirmSyncNow = async () => {
    if (!onSyncNow) return;
    setSyncConfirmOpen(false);
    await onSyncNow();
  };

  return (
    <Card>
      <CardContent>
        <Stack spacing={2}>
          <Stack direction="row" justifyContent="space-between" alignItems="center">
            <Stack spacing={0.5}>
              <Stack direction="row" spacing={1} alignItems="center">
                <Box component="img" src="/google-sheets-icon.svg" alt="Google Sheets" sx={{ width: 24, height: 24 }} />
                <Typography variant="h6">Google Sheets</Typography>
              </Stack>
              <Typography variant="body2" color="text.secondary">
                Status: {globalStatusLabel}
              </Typography>
            </Stack>
            <Stack direction="column" spacing={1} alignItems="flex-end">
              <Button
                size="small"
                variant="outlined"
                startIcon={<SyncAltIcon />}
                disabled={!hasConnectedSheet || isBusy || !canEdit}
                onClick={() => {
                  requestSyncNow();
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

          <Typography variant="body2" color="text.secondary">
            {summaryText}
          </Typography>

          <Typography variant="subtitle2" color="text.secondary">
            Sheet-wise integration setup
          </Typography>

          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ bgcolor: "action.hover" }}>
                  <TableCell sx={{ fontWeight: 600 }}>Connector</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Status</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Source</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Info</TableCell>
                  <TableCell sx={{ fontWeight: 600 }} align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map((row) => {
                  const isOpen = expanded === row.profileName;
                  const isNone = row.summary.authorityState === "none";
                  const isPaused = row.summary.authorityState === "paused";
                  const wizardSource: SourceType =
                    isPaused
                      ? (row.backendActive ?? (row.selectedMode === "oauth" ? "oauth" : "shared"))
                      : (row.selectedMode === "oauth" ? "oauth" : "shared");
                  const persistedConfirmed = Boolean(
                    row.activeConfig?.mappingConfirmedAt &&
                      row.activeConfig?.mappingHash &&
                      row.activeConfig.mappingHash === row.activeMappingHash
                  );
                  const isConfirmed =
                    persistedConfirmed || isMappingConfirmed(row.profileName, row.activeMappingHash);
                  const mappingStatusText =
                    row.missingRequiredCount > 0 || row.duplicateTargets > 0 || isPaused
                      ? "Invalid"
                    : isConfirmed
                        ? "Confirmed"
                        : "Needs review";
                  const mappingStatusColor =
                    mappingStatusText === "Confirmed"
                      ? "success.main"
                      : mappingStatusText === "Needs review"
                        ? "warning.main"
                        : "error.main";
                  const readiness: "not_configured" | "invalid" | "needs_review" | "ready" = isNone
                    ? "not_configured"
                    : (row.missingRequiredCount > 0 || row.duplicateTargets > 0 || isPaused)
                      ? "invalid"
                      : isConfirmed
                        ? "ready"
                        : "needs_review";
                  const syncBlockedReason =
                    readiness !== "ready"
                      ? readiness === "not_configured"
                        ? "Set up this connector before syncing."
                        : readiness === "invalid"
                          ? "Fix mapping issues before syncing."
                          : "Confirm mapping before syncing."
                      : "";
                  const canSyncNow = Boolean(readiness === "ready" && canEdit && onSyncNow && !isBusy);
                  const sheetUrl = row.activeConfig?.spreadsheetId
                    ? `https://docs.google.com/spreadsheets/d/${row.activeConfig.spreadsheetId}/edit`
                    : null;
                  const primaryActionLabel =
                    readiness === "not_configured"
                      ? "Setup sheet"
                      : readiness === "invalid"
                        ? "Fix mapping"
                        : readiness === "needs_review"
                          ? "Confirm mapping"
                          : "Sync now";
                  return (
                    <Fragment key={row.profileName}>
                      <TableRow hover>
                        <TableCell>
                          <Stack spacing={0.25}>
                            <Typography variant="body2" fontWeight={700}>{row.profileName}</Typography>
                            <Typography variant="caption" color="text.secondary">{row.mappedCount} mapped</Typography>
                          </Stack>
                        </TableCell>
                        <TableCell>
                          {readiness === "ready"
                            ? "Completed"
                            : readiness === "needs_review"
                              ? "Needs review"
                              : readiness === "invalid"
                                ? "Invalid"
                                : "Not configured"}
                        </TableCell>
                        <TableCell sx={{ color: row.backendActive ? "text.primary" : "text.disabled" }}>
                          {row.backendActive === "oauth" ? "OAuth" : row.backendActive === "shared" ? "Shared" : "—"}
                        </TableCell>
                        <TableCell>
                          <Typography variant="caption" color="text.secondary" noWrap>
                            {row.activeConfig?.spreadsheetId
                              ? `${row.activeConfig.spreadsheetTitle || "Unknown spreadsheet"} • ${row.activeConfig.sheetName || "Sheet1"}`
                              : "No spreadsheet selected yet"}
                          </Typography>
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
                            {row.summary.ctaLabel}
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

                                <Box
                                  sx={{
                                    display: "grid",
                                    gridTemplateColumns: { xs: "1fr", md: "minmax(0, 7fr) minmax(0, 3fr)" },
                                    gap: 1.5,
                                    alignItems: "start",
                                  }}
                                >
                                  <Stack spacing={1.25}>
                                    <Paper variant="outlined" sx={{ p: 1.25 }}>
                                      <Stack spacing={0.5}>
                                        <Typography variant="subtitle2">Sheet information</Typography>
                                        <Typography variant="caption" color="text.secondary">
                                          Sheet name: {row.activeConfig?.spreadsheetTitle || "Unknown spreadsheet"}
                                        </Typography>
                                        <Typography variant="caption" color="text.secondary">
                                          Tab: {row.activeConfig?.sheetName || "—"}
                                        </Typography>
                                        <Typography variant="caption" color="text.secondary">
                                          Spreadsheet ID: {row.activeConfig?.spreadsheetId || "—"}
                                        </Typography>
                                        <Typography variant="caption" color="text.secondary">
                                          Sheet URL:{" "}
                                          {sheetUrl ? (
                                            <a href={sheetUrl} target="_blank" rel="noreferrer">
                                              {sheetUrl}
                                            </a>
                                          ) : (
                                            "—"
                                          )}
                                        </Typography>
                                        <Typography variant="caption" color="text.secondary">
                                          Source: {row.backendActive === "oauth" ? "OAuth" : row.backendActive === "shared" ? "Shared" : "—"}
                                        </Typography>
                                        <Typography variant="caption" color="text.secondary">
                                          Last sync: {row.activeConfig?.lastSyncAt ? new Date(row.activeConfig.lastSyncAt).toLocaleString() : "—"}
                                        </Typography>
                                      </Stack>
                                    </Paper>

                                    <Paper variant="outlined" sx={{ p: 1.25 }}>
                                      <Stack spacing={0.5}>
                                        <Typography variant="subtitle2">Mapping summary</Typography>
                                        <Typography variant="caption" color="text.secondary">
                                          Fields mapped: {row.activeConfig?.mappedCount ?? 0}
                                        </Typography>
                                        <Typography variant="caption" sx={{ color: mappingStatusColor, fontWeight: 700 }}>
                                          Mapping: {mappingStatusText}
                                        </Typography>
                                        {readiness === "invalid" ? (
                                          <Typography variant="caption" color="error.main">
                                            Missing required: {row.missingRequiredCount} • Duplicates: {row.duplicateTargets}
                                          </Typography>
                                        ) : null}
                                      </Stack>
                                    </Paper>
                                  </Stack>

                                  <Paper variant="outlined" sx={{ p: 1.25 }}>
                                    <Stack spacing={1}>
                                      <Typography variant="subtitle2">Actions</Typography>
                                      <Tooltip title={readiness === "ready" ? "" : syncBlockedReason}>
                                        <span>
                                          <Button
                                            size="small"
                                            variant="contained"
                                            fullWidth
                                            disabled={readiness === "ready" ? !canSyncNow : isBusy || !canEdit}
                                            onClick={async () => {
                                              if (readiness === "not_configured") {
                                                openWizard(row.profileName, 0, wizardSource);
                                                return;
                                              }
                                              if (readiness === "invalid") {
                                                openWizard(row.profileName, 2, wizardSource);
                                                return;
                                              }
                                              if (readiness === "needs_review") {
                                                setMappingModalProfile(row.profileName);
                                                return;
                                              }
                                              requestSyncNow();
                                            }}
                                          >
                                            {primaryActionLabel}
                                          </Button>
                                        </span>
                                      </Tooltip>

                                      {readiness !== "not_configured" ? (
                                        <>
                                          <Button
                                            size="small"
                                            variant="outlined"
                                            fullWidth
                                            disabled={isBusy || !canEdit}
                                            onClick={() => setMappingModalProfile(row.profileName)}
                                          >
                                            View mapping
                                          </Button>
                                          <Button
                                            size="small"
                                            variant="outlined"
                                            fullWidth
                                            disabled={isBusy || !canEdit}
                                            onClick={() => openWizard(row.profileName, readiness === "ready" ? 1 : 0, wizardSource)}
                                          >
                                            Change sheet
                                          </Button>
                                          {row.backendActive === "shared" ? (
                                            <Button
                                              size="small"
                                              variant="outlined"
                                              fullWidth
                                              onClick={() => setScheduleDialogOpen(true)}
                                              disabled={isBusy || !canEdit}
                                            >
                                              Sync settings
                                            </Button>
                                          ) : null}
                                          <Divider />
                                          <Typography variant="caption" color="error.main" sx={{ fontWeight: 700 }}>
                                            Danger zone
                                          </Typography>
                                          <Button
                                            size="small"
                                            variant="outlined"
                                            color="error"
                                            fullWidth
                                            onClick={() =>
                                              handleOpenDeleteDialog({
                                                selectedMode: row.selectedMode,
                                                profileName: row.profileName,
                                              })
                                            }
                                            disabled={isBusy || !canEdit}
                                          >
                                            Remove connector setup
                                          </Button>
                                        </>
                                      ) : null}
                                    </Stack>
                                  </Paper>
                                </Box>

                                <GoogleSheetsSetupInline
                                  mode={row.selectedMode === "oauth" ? "oauth" : "service_account"}
                                  settings={settings}
                                  canEdit={canEdit}
                                  isBusy={isBusy}
                                  oauthStatus={oauthStatus}
                                  lockedProfileName={row.profileName}
                                  openWizardToken={wizardOpenRequest[row.profileName].token}
                                  openWizardStep={wizardOpenRequest[row.profileName].startStep}
                                  openWizardSource={wizardOpenRequest[row.profileName].sourceType}
                                  onConsumeOpenWizardToken={() => consumeOpenWizardToken(row.profileName)}
                                  onOpenSyncSetup={() => setScheduleDialogOpen(true)}
                                  onDebug={onDebug}
                                  onModeChange={(nextMode) => onChangeProfileMode(row.profileName, nextMode)}
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
      <MappingModal
        open={Boolean(mappingModalProfile)}
        profileName={mappingModalRow?.profileName ?? "POS DATA SHEET"}
        mapping={mappingModalRow?.activeMapping ?? {}}
        mappingPairs={mappingModalRow?.mappingPairs ?? []}
        readiness={
          !mappingModalRow
            ? "not_configured"
            : mappingModalRow.summary.authorityState === "none"
              ? "not_configured"
              : (mappingModalRow.missingRequiredCount > 0 || mappingModalRow.duplicateTargets > 0)
                ? "invalid"
                : (() => {
                    const persistedConfirmed = Boolean(
                      mappingModalRow.activeConfig?.mappingConfirmedAt &&
                        mappingModalRow.activeConfig?.mappingHash &&
                        mappingModalRow.activeConfig.mappingHash === mappingModalRow.activeMappingHash
                    );
                    const confirmed = persistedConfirmed || isMappingConfirmed(mappingModalRow.profileName, mappingModalRow.activeMappingHash);
                    return confirmed ? "ready" : "needs_review";
                  })()
        }
        onClose={() => setMappingModalProfile(null)}
        onEdit={() => {
          if (!mappingModalRow) return;
          const wizardSource: SourceType =
            mappingModalRow.backendActive ??
            (mappingModalRow.selectedMode === "oauth" ? "oauth" : "shared");
          openWizard(mappingModalRow.profileName, 1, wizardSource);
          setMappingModalProfile(null);
        }}
        onConfirm={async () => {
          if (!mappingModalRow || !mappingModalRow.backendActive || !mappingModalRow.activeConfig?.spreadsheetId) return;
          try {
            const sourceId =
              mappingModalRow.backendActive === "oauth"
                ? (mappingModalRow.oauthConfig.sourceId ?? undefined)
                : undefined;
            const profileId =
              mappingModalRow.backendActive === "shared"
                ? (mappingModalRow.sharedConfig.profileId ?? undefined)
                : undefined;
            await settingsApi.commitGoogleSheetsChange({
              connectorKey: "pos_daily",
              sourceType: mappingModalRow.backendActive,
              sourceId,
              profileId,
              sourceName:
                mappingModalRow.backendActive === "oauth"
                  ? mappingModalRow.profileName
                  : undefined,
              profileName:
                mappingModalRow.backendActive === "shared"
                  ? mappingModalRow.profileName
                  : undefined,
              spreadsheetId: mappingModalRow.activeConfig.spreadsheetId,
              spreadsheetTitle: mappingModalRow.activeConfig.spreadsheetTitle || undefined,
              sheetName: mappingModalRow.activeConfig.sheetName || "Sheet1",
              headerRow: Number(mappingModalRow.activeConfig.headerRow ?? 1),
              mapping: mappingModalRow.activeMapping,
              transformations: mappingModalRow.activeConfig.transformations ?? {},
              mappingConfirmedAt: new Date().toISOString(),
              mappingHash: mappingModalRow.activeMappingHash,
              activate: true,
            });
            await onSettingsRefetch?.();
          } catch {
            // Preserve local confirmation state even if API save fails.
          }
          confirmMapping(mappingModalRow.profileName, mappingModalRow.activeMappingHash);
          setMappingModalProfile(null);
        }}
      />

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
      <Dialog open={syncConfirmOpen} onClose={() => setSyncConfirmOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle>Confirm sync</DialogTitle>
        <DialogContent dividers>
          <Typography variant="body2">
            This will pull the latest sheet data and upsert POS rows. Continue?
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSyncConfirmOpen(false)} disabled={isBusy}>
            Cancel
          </Button>
          <Button variant="contained" onClick={() => void handleConfirmSyncNow()} disabled={isBusy || !canEdit}>
            Continue
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
