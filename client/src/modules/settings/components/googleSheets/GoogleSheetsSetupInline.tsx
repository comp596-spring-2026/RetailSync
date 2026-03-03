import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import CloseIcon from '@mui/icons-material/Close';
import GridOnIcon from '@mui/icons-material/GridOn';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  CircularProgress,
  Divider,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Paper,
  Stack,
  Step,
  StepLabel,
  Stepper,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { useEffect, useMemo, useRef, useState } from 'react';
import { settingsApi } from '../../api';
import { posApi } from '../../../pos/api';
import { track } from '../../../../lib/eventing/track';
import { MatchingWizard } from '../../../pos/components';
import {
  getCompatibility,
  normalizeDerivedConfig,
  normalizeMapping,
  toMappingByTarget,
} from '../../../pos/components/matchingWizard/mappingLogic';
import type { GoogleSheetsSettings } from './GoogleSheetsIntegrationCard';
import { SourceSwitch, type SourceType } from './SourceSwitch';
import {
  getActiveSource,
  getSourceStatusOAuth,
  getSourceStatusShared,
  getStatusLabel,
  type SourceStatus,
  type SourceType as StatusSourceType,
} from './googleSheetsStatus';

const SHEET_PROFILE_OPTIONS = ['POS DATA SHEET'] as const;
type SheetProfileName = (typeof SHEET_PROFILE_OPTIONS)[number];

const TARGET_FIELDS = [
  'date',
  'day',
  'highTax',
  'lowTax',
  'saleTax',
  'totalSales',
  'gas',
  'lottery',
  'creditCard',
  'lotteryPayout',
  'creditPlusLottery',
  'cashDiff',
  'notes',
];

type TabInfo = { title: string; rowCount: number | null; columnCount: number | null };
type SheetFile = { id: string; name: string; modifiedTime: string | null };
type Suggestion = { col: string; header: string; suggestion: string; score: number };
type SyncState = { percent: number; stage: string } | null;
const DERIVED_FIELDS = ['day', 'totalSales', 'creditPlusLottery', 'cashDiff'] as const;
const OAUTH_WIZARD_RESUME_KEY = 'retailsync.googleSheets.oauthResumeWizard';

const WIZARD_STEPS = ['Source & Summary', 'Sheet & Preview', 'Mapping & Save'];
const DEFAULT_SERVICE_ACCOUNT_EMAIL = 'retailsync-run-sa@lively-infinity-488304-m9.iam.gserviceaccount.com';
const OAUTH_TOKENS_MISSING_TEXT = 'google oauth tokens not found';
const USE_CONNECTOR_NATIVE_SETTINGS = import.meta.env.VITE_USE_CONNECTOR_NATIVE_SETTINGS !== 'false';

const createCorrelationId = () => {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }
};

const readOAuthResumeFlag = (): { profileName: string; step: number; source: SourceType } | null => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(OAUTH_WIZARD_RESUME_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { profileName?: unknown; step?: unknown; source?: unknown };
    const profileName = String(parsed.profileName ?? '').trim();
    const source = parsed.source === 'oauth' ? 'oauth' : parsed.source === 'shared' ? 'shared' : 'oauth';
    const step = Number(parsed.step ?? 1);
    if (!profileName) return null;
    return { profileName, step: Number.isFinite(step) ? step : 1, source };
  } catch {
    return null;
  }
};

const writeOAuthResumeFlag = (value: { profileName: string; step: number; source: SourceType }) => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(OAUTH_WIZARD_RESUME_KEY, JSON.stringify(value));
};

const clearOAuthResumeFlag = () => {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(OAUTH_WIZARD_RESUME_KEY);
};

const normalizeName = (value: string) => value.trim().toUpperCase();

const parseRangeTab = (range?: string) => {
  if (!range) return '';
  const tab = range.split('!')[0]?.trim();
  return tab ? tab.replace(/^'/, '').replace(/'$/, '') : '';
};

const parseSpreadsheetId = (value: string) => {
  const input = String(value ?? '').trim();
  if (!input) return '';
  const match = input.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return match?.[1] ?? input;
};

const statusToHealth = (status: SourceStatus) => {
  if (status === 'ready') return { value: 100, color: '#2e7d32', light: '#e8f5e9' };
  if (status === 'incomplete') return { value: 55, color: '#ed6c02', light: '#fff3e0' };
  return { value: 15, color: '#d32f2f', light: '#ffebee' };
};

const isSuppressedOAuthMessage = (message: string) =>
  message.toLowerCase().includes(OAUTH_TOKENS_MISSING_TEXT);

const mapSharedVerifyErrorMessage = (rawMessage: string, serviceAccountEmail: string) => {
  const normalized = rawMessage.trim().toLowerCase();
  if (!normalized || normalized === 'unknown') {
    return `Shared source is not verified. Share this sheet with ${serviceAccountEmail} and verify again.`;
  }
  if (
    normalized === 'not_shared' ||
    normalized === 'not_sahred' ||
    normalized.includes('not_shared') ||
    normalized.includes('not_sahred')
  ) {
    return `This sheet is not shared with ${serviceAccountEmail}. Open Google Sheets > Share, add that email as Viewer/Editor, then verify again.`;
  }
  if (normalized === 'not_found' || normalized.includes('not found')) {
    return 'Spreadsheet not found. Check the Spreadsheet ID/URL and verify again.';
  }
  if (normalized === 'tab_not_found' || normalized.includes('unable to parse range')) {
    return 'Selected tab was not found. Pick a valid tab in the selected spreadsheet and try again.';
  }
  if (normalized === 'no_permission' || normalized.includes('permission')) {
    return `Access denied for ${serviceAccountEmail}. Share the sheet with that email and verify again.`;
  }
  return rawMessage;
};

const mapSheetsRuntimeErrorMessage = (rawMessage: string) => {
  const normalized = rawMessage.trim().toLowerCase();
  if (normalized === 'tab_not_found' || normalized.includes('unable to parse range')) {
    return 'Selected tab was not found. Pick a valid tab in the selected spreadsheet and try again.';
  }
  if (normalized === 'not_found' || normalized.includes('not found')) {
    return 'Spreadsheet not found. Check the Spreadsheet ID/URL and try again.';
  }
  if (normalized === 'not_shared' || normalized === 'no_permission' || normalized.includes('permission')) {
    return 'Access denied. Share the sheet correctly and verify access before continuing.';
  }
  return rawMessage;
};

const buildConfiguredSharedFiles = (
  sharedSheets: GoogleSheetsSettings['sharedSheets'],
  sharedConfig: GoogleSheetsSettings['sharedConfig'],
  fallbackName: string,
): SheetFile[] => {
  const fromProfiles = (Array.isArray(sharedSheets) ? sharedSheets : [])
    .filter((profile) => typeof profile?.spreadsheetId === 'string' && profile.spreadsheetId.trim().length > 0)
    .map((profile) => ({
      id: String(profile.spreadsheetId).trim(),
      name: String(profile.spreadsheetTitle ?? profile.name ?? fallbackName),
      modifiedTime: null,
    }));

  const sharedConfigId = typeof sharedConfig?.spreadsheetId === 'string' ? sharedConfig.spreadsheetId.trim() : '';
  const fromLegacy =
    sharedConfigId.length > 0
      ? [{
          id: sharedConfigId,
          name: String(sharedConfig?.spreadsheetTitle ?? fallbackName),
          modifiedTime: null,
        }]
      : [];

  const dedup = new Map<string, SheetFile>();
  for (const file of [...fromProfiles, ...fromLegacy]) {
    if (!file.id) continue;
    if (!dedup.has(file.id)) dedup.set(file.id, file);
  }
  return Array.from(dedup.values());
};

type ResolvedConnectorConfig = {
  sourceType: SourceType;
  sourceId?: string;
  profileId?: string;
  spreadsheetId: string;
  spreadsheetTitle: string;
  sheetName: string;
  headerRow: number;
  mapping: Record<string, string>;
  transforms: Record<string, unknown>;
  mappedCount: number;
  lastSyncAt: string | null;
  lastImportAt: string | null;
  shareStatus?: 'unknown' | 'not_shared' | 'shared' | 'no_permission' | 'not_found';
};

const toSourceType = (mode: 'oauth' | 'service_account'): SourceType =>
  mode === 'oauth' ? 'oauth' : 'shared';

const toApiMode = (source: SourceType): 'oauth' | 'service_account' =>
  source === 'oauth' ? 'oauth' : 'service_account';

type SharedVerifyPayload = {
  ok?: boolean;
  connected?: boolean;
  shareStatus?: 'unknown' | 'not_shared' | 'shared' | 'no_permission' | 'not_found';
  serviceAccountEmail?: string;
  sharedConfig?: {
    shareStatus?: 'unknown' | 'not_shared' | 'shared' | 'no_permission' | 'not_found';
  };
  activeProfile?: {
    shareStatus?: 'unknown' | 'not_shared' | 'shared' | 'no_permission' | 'not_found';
  };
};

type Props = {
  mode: 'oauth' | 'service_account';
  settings: GoogleSheetsSettings;
  canEdit: boolean;
  isBusy: boolean;
  oauthStatus?: 'ok' | 'error' | null;
  lockedProfileName?: SheetProfileName;
  openWizardToken?: number;
  openWizardStep?: 0 | 1 | 2;
  openWizardSource?: SourceType;
  onConsumeOpenWizardToken?: () => void;
  onModeChange?: (mode: 'oauth' | 'service_account') => void;
  onOpenSyncSetup?: () => void;
  onDebug?: (mode: 'oauth' | 'shared') => void;
  onRequestDeleteSource?: (payload: {
    mode: 'oauth' | 'service_account';
    profileName: SheetProfileName;
  }) => void;
  onSaved: () => Promise<void> | void;
};

export const GoogleSheetsSetupInline = ({
  mode,
  settings,
  canEdit,
  isBusy,
  oauthStatus = null,
  lockedProfileName,
  openWizardToken = 0,
  openWizardStep = 0,
  openWizardSource,
  onConsumeOpenWizardToken,
  onModeChange: _onModeChange,
  onOpenSyncSetup,
  onDebug,
  onRequestDeleteSource,
  onSaved,
}: Props) => {
  void _onModeChange;
  void onOpenSyncSetup;
  void onRequestDeleteSource;
  const selectedProfileName: SheetProfileName = lockedProfileName ?? 'POS DATA SHEET';
  const selectedProfileNormalized = normalizeName(selectedProfileName);
  const oauthSources = Array.isArray(settings.sources) ? settings.sources : [];
  const sharedSheets = Array.isArray(settings.sharedSheets) ? settings.sharedSheets : [];
  const currentMode = settings.mode === 'oauth' ? 'oauth' : 'service_account';
  const oauthConnected = Boolean(settings.connected);
  // Do not block progression on oauthStatus because it can be stale right after callback.
  const oauthTokensPresent = oauthConnected;

  const resolveConfigForSource = (sourceType: SourceType): ResolvedConnectorConfig => {
    if (sourceType === 'oauth') {
      const source = oauthSources.find((entry) => normalizeName(entry.name) === selectedProfileNormalized);
      const mapping = source?.mapping ?? {};
      return {
        sourceType,
        sourceId: source?.sourceId,
        spreadsheetId: source?.spreadsheetId ?? '',
        spreadsheetTitle: source?.spreadsheetTitle ?? source?.name ?? '',
        sheetName: parseRangeTab(source?.range) || 'Sheet1',
        headerRow: 1,
        mapping,
        transforms: (source?.transformations as Record<string, unknown> | undefined) ?? {},
        mappedCount: Object.keys(mapping).length,
        lastSyncAt: null,
        lastImportAt: null,
      };
    }

    const profile =
      sharedSheets.find((entry) => normalizeName(entry.name) === selectedProfileNormalized) ??
      sharedSheets.find((entry) => entry.isDefault) ??
      sharedSheets[0];

    const mapping =
      profile?.columnsMap ??
      profile?.lastMapping?.columnsMap ??
      settings.sharedConfig?.columnsMap ??
      settings.sharedConfig?.lastMapping?.columnsMap ??
      {};

    return {
      sourceType,
      profileId: profile?.profileId,
      spreadsheetId: profile?.spreadsheetId ?? settings.sharedConfig?.spreadsheetId ?? '',
      spreadsheetTitle:
        profile?.spreadsheetTitle ??
        settings.sharedConfig?.spreadsheetTitle ??
        profile?.name ??
        selectedProfileName,
      sheetName: profile?.sheetName ?? settings.sharedConfig?.sheetName ?? 'Sheet1',
      headerRow: Number(profile?.headerRow ?? settings.sharedConfig?.headerRow ?? 1),
      mapping,
      transforms: (profile?.lastMapping?.transformations as Record<string, unknown> | undefined) ?? {},
      mappedCount: Object.keys(mapping).length,
      lastSyncAt: (profile?.lastImportAt ?? settings.sharedConfig?.lastImportAt ?? null) as string | null,
      lastImportAt: (profile?.lastImportAt ?? settings.sharedConfig?.lastImportAt ?? null) as string | null,
      shareStatus: profile?.shareStatus ?? settings.sharedConfig?.shareStatus,
    };
  };

  const oauthConfig = resolveConfigForSource('oauth');
  const sharedConfig = resolveConfigForSource('shared');
  const sharedShareStatus = sharedConfig.shareStatus ?? 'unknown';
  const sharedConfigured =
    Boolean(sharedConfig.spreadsheetId) &&
    sharedShareStatus === 'shared';
  const statuses: Record<StatusSourceType, SourceStatus> = {
    oauth: getSourceStatusOAuth(oauthConfig, oauthTokensPresent),
    shared: getSourceStatusShared(sharedConfig, sharedConfigured),
  };
  const activeSource = getActiveSource({ mode: currentMode }, statuses);
  const currentConfig = activeSource ? resolveConfigForSource(activeSource) : null;

  const [wizardOpen, setWizardOpen] = useState(false);
  const [activeStep, setActiveStep] = useState(0);
  const [stagedSource, setStagedSource] = useState<SourceType>(toSourceType(mode));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncState, setSyncState] = useState<SyncState>(null);
  const [copyFromExisting, setCopyFromExisting] = useState(false);
  const [sharedVerifyInput, setSharedVerifyInput] = useState('');
  const [sharedVerified, setSharedVerified] = useState(false);
  const [correlationId, setCorrelationId] = useState(createCorrelationId);

  const [oauthFiles, setOauthFiles] = useState<SheetFile[]>([]);
  const [sharedFiles, setSharedFiles] = useState<SheetFile[]>([]);
  const [sheetSearch, setSheetSearch] = useState('');

  const [selectedSheet, setSelectedSheet] = useState<{ id: string; name: string } | null>(null);
  const [tabs, setTabs] = useState<TabInfo[]>([]);
  const [tabsLoading, setTabsLoading] = useState(false);
  const [selectedTab, setSelectedTab] = useState('');
  const [headerRow, setHeaderRow] = useState(1);

  const [headers, setHeaders] = useState<string[]>([]);
  const [sampleRows, setSampleRows] = useState<string[][]>([]);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [transforms, setTransforms] = useState<Record<string, unknown>>({});
  const [rowErrors, setRowErrors] = useState<
    Array<{ rowIndex: number; errors: Array<{ col: string; message: string }> }>
  >([]);
  const [resumeApplied, setResumeApplied] = useState(false);
  const [oauthStatusEmail, setOauthStatusEmail] = useState<string | null>(null);
  const [oauthStatusScopes, setOauthStatusScopes] = useState<string[] | null>(null);
  const [oauthStatusExpiresInSec, setOauthStatusExpiresInSec] = useState<number | null>(null);

  const lastPreviewKeyRef = useRef<string>('');

  const stagedMode = toApiMode(stagedSource);
  const stagedSavedConfig = useMemo(
    () => resolveConfigForSource(stagedSource),
    [oauthSources, selectedProfileNormalized, settings.sharedConfig, sharedSheets, stagedSource],
  );
  const eventContext = useMemo(
    () => ({
      companyId: 'unknown',
      integrationMode: stagedSource,
      activeConnectorKey: 'pos_daily',
      spreadsheetId: selectedSheet?.id ?? stagedSavedConfig.spreadsheetId ?? null,
      sheetName: selectedTab || stagedSavedConfig.sheetName || null,
      profileId: stagedSource === 'shared' ? (stagedSavedConfig.profileId ?? null) : null,
      sourceId: stagedSource === 'oauth' ? (stagedSavedConfig.sourceId ?? null) : null,
      correlationId,
    }),
    [correlationId, selectedSheet?.id, selectedTab, stagedSavedConfig.profileId, stagedSavedConfig.sheetName, stagedSavedConfig.sourceId, stagedSavedConfig.spreadsheetId, stagedSource],
  );

  const stagedSourceStatus = statuses[stagedSource];

  const sharedContinueReady = sharedVerified;
  const sharedVerifySpreadsheetId = parseSpreadsheetId(sharedVerifyInput);
  const continueBlockedReason =
    stagedSource === 'oauth' && stagedSourceStatus === 'not_connected'
      ? 'OAuth is not connected. Connect OAuth to continue.'
      : stagedSource === 'shared' && !sharedContinueReady
        ? 'Shared source is not verified. Verify sheet access to continue.'
      : null;

  const currentLastSyncLabel = currentConfig?.lastImportAt
    ? new Date(currentConfig.lastImportAt).toLocaleString()
    : '—';
  const currentSpreadsheetLabel = currentConfig?.spreadsheetTitle || '—';
  const oauthConnectedEmail = settings.connectedEmail?.trim() || null;
  const effectiveOAuthEmail = oauthConnectedEmail || oauthStatusEmail;
  const stagedLastSyncLabel = stagedSavedConfig.lastImportAt
    ? new Date(stagedSavedConfig.lastImportAt).toLocaleString()
    : '—';
  const oauthStatusMetaLabel = useMemo(() => {
    const parts: string[] = [];
    if (typeof oauthStatusExpiresInSec === 'number' && Number.isFinite(oauthStatusExpiresInSec)) {
      const minutes = Math.max(0, Math.round(oauthStatusExpiresInSec / 60));
      parts.push(`Token expires in ~${minutes} min`);
    }
    if (Array.isArray(oauthStatusScopes) && oauthStatusScopes.length > 0) {
      parts.push(`Scopes: ${oauthStatusScopes.length}`);
    }
    return parts.join(' • ');
  }, [oauthStatusExpiresInSec, oauthStatusScopes]);

  const stepOneTitle = useMemo(() => {
    const showingActiveSourceSummary = Boolean(activeSource) && stagedSource === activeSource;
    if (showingActiveSourceSummary) {
      return `Currently active: ${activeSource === 'oauth' ? 'OAuth' : 'Shared'}`;
    }
    if (stagedSource === 'oauth') {
      if (stagedSourceStatus === 'incomplete') return 'Current status: OAuth connected (setup incomplete)';
      if (stagedSourceStatus === 'not_connected') return 'Current status: OAuth not connected';
    }
    if (stagedSource === 'shared') {
      if (sharedContinueReady) return 'Current status: Shared source verified (setup incomplete)';
      return 'Current status: Shared source not verified';
    }
    return 'Current status: No sync configured yet';
  }, [activeSource, sharedContinueReady, stagedSource, stagedSourceStatus]);

  const stepOneSubtitle = useMemo(() => {
    const showingActiveSourceSummary = Boolean(activeSource) && stagedSource === activeSource;
    if (showingActiveSourceSummary && currentConfig) {
      return `Spreadsheet: ${currentSpreadsheetLabel} • Tab: ${currentConfig.sheetName || '—'} • Spreadsheet ID: ${currentConfig.spreadsheetId || '—'} • Last sync: ${currentLastSyncLabel} • ${currentConfig.mappedCount} fields mapped`;
    }
    if (stagedSource === 'oauth') {
      if (stagedSourceStatus === 'incomplete') {
        const connectedAs = effectiveOAuthEmail ? `Connected as ${effectiveOAuthEmail}. ` : '';
        return `${connectedAs}Continue to Sheet & Preview to select spreadsheet, tab, and mapping.`;
      }
      if (stagedSourceStatus === 'not_connected') {
        return 'Connect OAuth first, then continue to sheet and mapping setup.';
      }
    }
    if (stagedSource === 'shared') {
      if (sharedContinueReady) {
        return 'Shared access is verified. Continue to Sheet & Preview to select tab and mapping.';
      }
      return 'Verify shared sheet access to continue.';
    }
    return 'Choose source and connect/verify access to proceed.';
  }, [
    activeSource,
    currentConfig,
    currentLastSyncLabel,
    currentSpreadsheetLabel,
    effectiveOAuthEmail,
    sharedContinueReady,
    stagedSource,
    stagedSourceStatus,
  ]);

  const stagedMappedCount = useMemo(
    () => Object.values(mapping).filter(Boolean).length,
    [mapping],
  );

  const visibleFiles = useMemo(() => {
    const files = stagedSource === 'oauth' ? oauthFiles : sharedFiles;
    const query = sheetSearch.trim().toLowerCase();
    if (!query) return files;
    return files.filter((file) => file.name.toLowerCase().includes(query));
  }, [oauthFiles, sharedFiles, sheetSearch, stagedSource]);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const files = stagedSource === 'oauth' ? oauthFiles : sharedFiles;
    console.info('[GoogleSheets Setup] visible files state', {
      stagedSource,
      totalFiles: files.length,
      visibleFiles: visibleFiles.length,
      search: sheetSearch,
      activeStep,
    });
  }, [activeStep, oauthFiles, sharedFiles, sheetSearch, stagedSource, visibleFiles.length]);

  const previewColumns = useMemo(() => {
    if (headers.length > 0) return headers;
    const maxColumns = sampleRows.reduce((max, row) => Math.max(max, row.length), 0);
    return Array.from({ length: maxColumns }, (_, index) => `Column ${index + 1}`);
  }, [headers, sampleRows]);

  const applyDraftFromConfig = (config: ResolvedConnectorConfig) => {
    setSelectedSheet(
      config.spreadsheetId
        ? { id: config.spreadsheetId, name: config.spreadsheetTitle || selectedProfileName }
        : null,
    );
    setSelectedTab(config.sheetName || '');
    setHeaderRow(Number(config.headerRow ?? 1));
    setMapping({ ...config.mapping });
    const nextTransforms = { ...config.transforms };
    const rawDerived = Array.isArray(nextTransforms.__derivedFields)
      ? nextTransforms.__derivedFields.map((value) => String(value))
      : [];
    const filteredDerived = rawDerived.filter((value) =>
      DERIVED_FIELDS.includes(value as (typeof DERIVED_FIELDS)[number]),
    );
    nextTransforms.__derivedFields = filteredDerived.length > 0 ? filteredDerived : [...DERIVED_FIELDS];
    setTransforms(nextTransforms);

    setTabs([]);
    setHeaders([]);
    setSampleRows([]);
    setSuggestions([]);
    setRowErrors([]);
    setError(null);
    setSheetSearch('');
    lastPreviewKeyRef.current = '';
  };

  const hydrateDraftFromSource = (nextSource: SourceType) => {
    const config = resolveConfigForSource(nextSource);
    applyDraftFromConfig(config);
    if (nextSource === 'shared') {
      setSharedVerifyInput(config.spreadsheetId || '');
      setSharedVerified(sharedShareStatus === 'shared');
    }
  };

  const loadFiles = async (sourceType: SourceType) => {
    try {
      if (sourceType === 'oauth') {
        const response = await settingsApi.listOAuthSpreadsheets();
        const root = response.data as
          | { data?: { files?: SheetFile[] }; files?: SheetFile[] }
          | undefined;
        const files = (root?.data?.files ?? root?.files ?? []) as SheetFile[];
        if (import.meta.env.DEV) {
          console.info('[GoogleSheets Setup] OAuth files loaded', {
            count: files.length,
            names: files.slice(0, 5).map((file) => file.name),
          });
        }
        setOauthFiles(files);
      } else {
        // Shared mode is tenant-config driven; avoid listing all service-account-visible sheets.
        // Show only sheets already configured in this company's shared settings.
        const files = buildConfiguredSharedFiles(sharedSheets, settings.sharedConfig, selectedProfileName);
        if (import.meta.env.DEV) {
          console.info('[GoogleSheets Setup] Shared files loaded', {
            count: files.length,
            names: files.slice(0, 5).map((file) => file.name),
          });
        }
        setSharedFiles(files);
      }
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'Failed to load available spreadsheets';
      if (sourceType === 'oauth' && isSuppressedOAuthMessage(message)) {
        setOauthFiles([]);
        return;
      }
      setError(message);
      if (import.meta.env.DEV) {
        console.error('[GoogleSheets Setup] loadFiles failed', {
          sourceType,
          message,
        });
      }
    }
  };

  const loadTabs = async (spreadsheetId: string) => {
    const response = await settingsApi.listTabsWithSpreadsheetId({
      spreadsheetId,
      authMode: stagedMode,
    });
    const loadedTabsRaw = ((response.data as { data?: { tabs?: Array<TabInfo & { sheetName?: string }> } })?.data?.tabs ??
      []) as Array<TabInfo & { sheetName?: string }>;
    const loadedTabs = loadedTabsRaw
      .map((tab) => ({
        title: String(tab.title ?? tab.sheetName ?? '').trim(),
        rowCount: tab.rowCount ?? null,
        columnCount: tab.columnCount ?? null,
      }))
      .filter((tab) => tab.title.length > 0);
    setTabs(loadedTabs);
    return loadedTabs;
  };

  const startOAuthConnect = async () => {
    try {
      track('sheets_oauth_connect_clicked', eventContext);
      setBusy(true);
      setError(null);
      writeOAuthResumeFlag({
        profileName: selectedProfileName,
        // Return users to Sheet & Preview after OAuth succeeds.
        step: 1,
        source: 'oauth',
      });
      const response = await settingsApi.getGoogleConnectUrl();
      const url = (response.data as { data?: { url?: string } })?.data?.url;
      if (!url) {
        setError('Could not get OAuth authorization URL.');
        clearOAuthResumeFlag();
        return;
      }
      window.location.href = url;
    } catch (err: unknown) {
      clearOAuthResumeFlag();
      const message =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'Failed to start OAuth connection';
      setError(message);
    } finally {
      setBusy(false);
    }
  };

  const verifySharedAccess = async () => {
    const spreadsheetId = parseSpreadsheetId(sharedVerifyInput);
    if (!spreadsheetId) {
      setError('Enter a valid spreadsheet ID or Google Sheets URL.');
      return;
    }

    try {
      track('sheets_shared_verify_clicked', { ...eventContext, spreadsheetId });
      setBusy(true);
      setError(null);
      await settingsApi.configureSharedSheet({
        profileId: stagedSavedConfig.profileId,
        profileName: selectedProfileName,
        spreadsheetId,
        enabled: true,
      });
      const verifyResponse = await settingsApi.verifySharedSheet({
        profileId: stagedSavedConfig.profileId,
        spreadsheetId,
      });
      const verifyRoot = verifyResponse.data as SharedVerifyPayload & { data?: SharedVerifyPayload };
      const verifyPayload: SharedVerifyPayload = verifyRoot?.data ?? verifyRoot;
      const resolvedServiceAccountEmail = verifyPayload?.serviceAccountEmail?.trim() || serviceAccountLabel;
      const shareStatus =
        verifyPayload?.shareStatus ??
        verifyPayload?.sharedConfig?.shareStatus ??
        verifyPayload?.activeProfile?.shareStatus ??
        'unknown';
      const isVerified =
        Boolean(verifyPayload?.connected) ||
        shareStatus === 'shared' ||
        (Boolean(verifyPayload?.ok) && shareStatus !== 'not_shared' && shareStatus !== 'no_permission' && shareStatus !== 'not_found');
      if (!isVerified) {
        setSharedVerified(false);
        track('sheets_shared_verify_failed', { ...eventContext, spreadsheetId, shareStatus });
        setError(mapSharedVerifyErrorMessage(shareStatus, resolvedServiceAccountEmail));
        return;
      }
      setSharedVerified(true);
      track('sheets_shared_verify_succeeded', { ...eventContext, spreadsheetId, shareStatus });
      await loadFiles('shared');
      const verifiedTitle = String((verifyPayload as { spreadsheetTitle?: string })?.spreadsheetTitle ?? '').trim();
      const resolvedSheetName = verifiedTitle || stagedSavedConfig.spreadsheetTitle || selectedProfileName;
      setSharedFiles((prev) => {
        const existingIndex = prev.findIndex((file) => file.id === spreadsheetId);
        if (existingIndex >= 0) {
          const next = [...prev];
          next[existingIndex] = {
            ...next[existingIndex],
            name: resolvedSheetName,
          };
          return next;
        }
        return [...prev, { id: spreadsheetId, name: resolvedSheetName, modifiedTime: null }];
      });
      setSelectedSheet({ id: spreadsheetId, name: resolvedSheetName });
      setActiveStep(1);
    } catch (err: unknown) {
      setSharedVerified(false);
      track('sheets_shared_verify_failed', { ...eventContext, spreadsheetId });
      const rawMessage =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'Shared verification failed. Ensure this sheet is shared with the service account.';
      setError(mapSharedVerifyErrorMessage(rawMessage, serviceAccountLabel));
    } finally {
      setBusy(false);
    }
  };

  const loadPreview = async (spreadsheetId: string, tabName: string) => {
    track('sheets_preview_requested', { ...eventContext, spreadsheetId, sheetName: tabName });
    try {
      const staged = await settingsApi.stageGoogleSheetsChange({
        connectorKey: 'pos_daily',
        sourceType: stagedSource,
        spreadsheetId,
        sheetName: tabName,
        headerRow,
        mapping: Object.keys(mapping).length > 0 ? mapping : undefined,
        transformations: transforms,
      });

      const stagedData = (staged.data as {
        data?: {
          preview?: {
            header?: string[];
            sampleRows?: string[][];
            suggestions?: Suggestion[];
          };
        };
      })?.data;

      const stagedHeader = stagedData?.preview?.header ?? [];
      if (stagedHeader.length > 0) {
        const stagedRows = stagedData?.preview?.sampleRows ?? [];
        const stagedSuggestions = stagedData?.preview?.suggestions ?? [];
        setHeaders(stagedHeader);
        setSampleRows(stagedRows);
        setSuggestions(stagedSuggestions);
        if (Object.keys(mapping).length === 0) {
          const suggestedMap = Object.fromEntries(
            stagedSuggestions.map((item) => [item.header, item.suggestion]),
          );
          setMapping(suggestedMap);
        }
        track('sheets_preview_succeeded', { ...eventContext, spreadsheetId, sheetName: tabName, source: 'stage-change' });
        return;
      }
    } catch {
      // Fall back to existing preview endpoint when stage-change endpoint is unavailable.
    }

    const source = stagedSource === 'oauth' ? 'oauth' : 'service';
    const preview = await posApi.previewSheet({
      source,
      spreadsheetId,
      tab: tabName,
      maxRows: 20,
      headerRow,
    });

    const data = preview.data?.data as
      | { header?: string[]; columns?: string[]; sampleRows?: string[][]; suggestions?: Suggestion[] }
      | undefined;

    let nextHeaders = data?.header ?? data?.columns ?? [];
    let nextSampleRows = data?.sampleRows ?? [];
    const nextSuggestions = data?.suggestions ?? [];

    let usedLocalHeaderDetection = false;
    if (nextHeaders.length === 0 && nextSampleRows.length > 0) {
      nextHeaders = nextSampleRows[0].map((cell) => String(cell ?? '').trim());
      nextSampleRows = nextSampleRows.slice(1);
      usedLocalHeaderDetection = true;
    }

    setHeaders(nextHeaders);
    setSampleRows(nextSampleRows);
    setSuggestions(usedLocalHeaderDetection ? [] : nextSuggestions);

    if (!usedLocalHeaderDetection && nextHeaders.length > 0 && Object.keys(mapping).length === 0) {
      const suggestedMap = Object.fromEntries(nextSuggestions.map((item) => [item.header, item.suggestion]));
      setMapping(suggestedMap);
    }
    track('sheets_preview_succeeded', { ...eventContext, spreadsheetId, sheetName: tabName, source: 'preview-endpoint' });
  };

  useEffect(() => {
    setStagedSource(toSourceType(mode));
  }, [mode]);

  useEffect(() => {
    hydrateDraftFromSource(stagedSource);
    void loadFiles(stagedSource);
    if (stagedSource !== activeSource) {
      setCopyFromExisting(false);
    }
  }, [stagedSource]);

  useEffect(() => {
    if (!openWizardToken) return;
    const nextSource = openWizardSource ?? toSourceType(mode);
    setWizardOpen(true);
    setCorrelationId(createCorrelationId());
    setActiveStep(openWizardStep);
    onConsumeOpenWizardToken?.();
    setStagedSource(nextSource);
    setError(null);
    setSyncState(null);
    setCopyFromExisting(false);
    setSheetSearch('');
    setRowErrors([]);
    lastPreviewKeyRef.current = '';
    track('sheets_setup_opened', { ...eventContext, openStep: openWizardStep });
    applyDraftFromConfig(resolveConfigForSource(nextSource));
    if (nextSource === 'shared') {
      const nextSharedConfig = resolveConfigForSource('shared');
      const nextShareStatus = nextSharedConfig.shareStatus ?? 'unknown';
      setSharedVerifyInput(nextSharedConfig.spreadsheetId || '');
      setSharedVerified(nextShareStatus === 'shared');
    } else {
      setSharedVerified(false);
      setSharedVerifyInput('');
    }
  }, [mode, onConsumeOpenWizardToken, openWizardSource, openWizardStep, openWizardToken]);

  useEffect(() => {
    if (resumeApplied) return;
    if (!oauthConnected) return;
    const resume = readOAuthResumeFlag();
    if (!resume) return;
    if (normalizeName(resume.profileName) !== selectedProfileNormalized) return;

    setResumeApplied(true);
    setWizardOpen(true);
    setCorrelationId(createCorrelationId());
    setStagedSource('oauth');
    setActiveStep(resume.step >= 1 ? 1 : 0);
    setError(null);
    setSyncState(null);
    setCopyFromExisting(false);
    setSheetSearch('');
    setRowErrors([]);
    lastPreviewKeyRef.current = '';
    applyDraftFromConfig(resolveConfigForSource('oauth'));
    void loadFiles('oauth');
    clearOAuthResumeFlag();
  }, [oauthConnected, resumeApplied, selectedProfileNormalized]);

  useEffect(() => {
    if (!activeSource || stagedSource === activeSource || !copyFromExisting) return;
    applyDraftFromConfig(resolveConfigForSource(activeSource));
  }, [activeSource, copyFromExisting, stagedSource]);

  useEffect(() => {
    if (activeStep < 1 || !selectedSheet?.id) return;
    setBusy(true);
    setTabsLoading(true);
    void loadTabs(selectedSheet.id)
      .then((loadedTabs) => {
        if (loadedTabs.length === 0) return;
        // Always default to first tab when tabs are loaded to keep selection deterministic.
        setSelectedTab(loadedTabs[0].title);
        track('sheets_tab_selected', {
          spreadsheetId: selectedSheet?.id ?? null,
          sheetName: loadedTabs[0].title,
          reason: 'auto-first-tab',
        });
        lastPreviewKeyRef.current = '';
      })
      .catch((err: unknown) => {
        const message =
          (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
          'Failed to load tabs';
        setError(mapSheetsRuntimeErrorMessage(message));
      })
      .finally(() => {
        setBusy(false);
        setTabsLoading(false);
      });
  }, [activeStep, selectedSheet?.id]);

  useEffect(() => {
    if (activeStep < 1 || visibleFiles.length === 0) return;
    const hasSelectedSheet =
      Boolean(selectedSheet?.id) && visibleFiles.some((file) => file.id === selectedSheet?.id);
    if (hasSelectedSheet) return;

    const firstSheet = visibleFiles[0];
    setSelectedSheet({ id: firstSheet.id, name: firstSheet.name });
    setSelectedTab('');
    setTabs([]);
    setHeaders([]);
    setSampleRows([]);
    setSuggestions([]);
    setRowErrors([]);
    lastPreviewKeyRef.current = '';
  }, [activeStep, selectedSheet?.id, visibleFiles]);

  useEffect(() => {
    if (activeStep < 1 || !selectedSheet?.id || !selectedTab || tabs.length === 0) return;
    if (!tabs.some((tab) => tab.title === selectedTab)) return;
    const previewKey = `${stagedSource}:${selectedSheet.id}:${selectedTab}:${headerRow}`;
    if (lastPreviewKeyRef.current === previewKey) return;
    lastPreviewKeyRef.current = previewKey;

    setBusy(true);
    void loadPreview(selectedSheet.id, selectedTab)
      .catch((err: unknown) => {
        const message =
          (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
          'Failed to load sheet preview';
        setError(mapSheetsRuntimeErrorMessage(message));
      })
      .finally(() => setBusy(false));
  }, [activeStep, selectedSheet?.id, selectedTab, headerRow, stagedSource, tabs]);

  const handleSourceSwitch = (next: SourceType) => {
    if (next === stagedSource) return;
    track('sheets_mode_selected', { ...eventContext, selectedMode: next });
    setStagedSource(next);
    setActiveStep(0);
  };

  const handleSelectSheet = (sheet: SheetFile) => {
    if (selectedSheet?.id === sheet.id) {
      setError(null);
      return;
    }

    setSelectedSheet({ id: sheet.id, name: sheet.name });
    track('sheets_file_selected', { ...eventContext, spreadsheetId: sheet.id, spreadsheetTitle: sheet.name });
    setSelectedTab('');
    setTabs([]);
    setHeaders([]);
    setSampleRows([]);
    setSuggestions([]);
    setRowErrors([]);
    setError(null);
    lastPreviewKeyRef.current = '';
  };

  const buildTransformsPayload = () => {
    const derivedFromState = Array.isArray(transforms.__derivedFields)
      ? transforms.__derivedFields.map((value) => String(value))
      : [];
    const filteredDerived = derivedFromState.filter((value) =>
      DERIVED_FIELDS.includes(value as (typeof DERIVED_FIELDS)[number]),
    );
    const normalizedDerived = filteredDerived.length > 0 ? filteredDerived : [...DERIVED_FIELDS];

    return {
      ...transforms,
      __derivedFields: normalizedDerived,
    } as Record<string, unknown>;
  };

  const runInstantSync = async (explicit?: {
    connectorKey?: string;
    integrationType?: 'oauth' | 'shared';
    sourceId?: string | null;
    profileId?: string | null;
  }) => {
    let timer: ReturnType<typeof setInterval> | null = null;
    try {
      setSyncState({ percent: 10, stage: 'Applying import...' });
      timer = setInterval(() => {
        setSyncState((prev) => {
          if (!prev || prev.percent >= 90) return prev;
          return { ...prev, percent: prev.percent + 8 };
        });
      }, 280);

      const payload = explicit?.integrationType
        ? {
            connectorKey: explicit.connectorKey ?? 'pos_daily',
            integrationType: explicit.integrationType,
            sourceId: explicit.integrationType === 'oauth' ? (explicit.sourceId ?? undefined) : undefined,
            profileId: explicit.integrationType === 'shared' ? (explicit.profileId ?? undefined) : undefined,
          }
        : {
            connectorKey: 'pos_daily',
            integrationType: stagedSource,
            sourceId: stagedSource === 'oauth' ? stagedSavedConfig.sourceId : undefined,
            profileId: stagedSource === 'shared' ? stagedSavedConfig.profileId : undefined,
          };

      const response = await posApi.commitImport(payload);
      const imported = Number(response.data?.data?.result?.imported ?? 0);
      setSyncState({ percent: 100, stage: `Sync complete. Processed ${imported} rows.` });
      window.setTimeout(() => setSyncState(null), 1800);
    } finally {
      if (timer) clearInterval(timer);
    }
  };

  const handleCommit = async () => {
    if (saveDisabledReason) {
      setError(saveDisabledReason);
      return;
    }
    const selectedSheetId = selectedSheet?.id;
    const selectedSheetName = selectedSheet?.name ?? selectedProfileName;
    if (!selectedSheetId) {
      setError('Select a spreadsheet and tab before saving.');
      return;
    }

    const normalizedMapping = normalizeMapping(headers, mapping);
    const transformsPayload = buildTransformsPayload();
    const mappingCompatibility = getCompatibility({
      mappingByTarget: toMappingByTarget(normalizedMapping),
      derivedConfig: normalizeDerivedConfig(transformsPayload, normalizedMapping),
      headers,
    });
    if (!mappingCompatibility.isValid) {
      setError('Compatibility check failed. Fix mapping issues before saving.');
      return;
    }

    setBusy(true);
    setError(null);

    try {
      const validationResponse = await posApi.validateMapping({
        mapping,
        transforms: transformsPayload,
        validateSample: true,
        spreadsheetId: selectedSheetId,
        tab: selectedTab,
        headerRow,
      });

      const validationData = validationResponse.data?.data as
        | {
            valid?: boolean;
            rowErrors?: Array<{ rowIndex: number; errors: Array<{ col: string; message: string }> }>;
          }
        | undefined;

      const nextErrors = validationData?.rowErrors ?? [];
      setRowErrors(nextErrors);
      if (!validationData?.valid) {
        track('sheets_mapping_failed', { ...eventContext, rowErrorCount: nextErrors.length });
        setError(`Validation found ${nextErrors.length} issue(s). Fix mapping and retry.`);
        return;
      }
      track('sheets_mapping_validated', { ...eventContext, mappedCount: Object.keys(normalizedMapping).length });

      if (USE_CONNECTOR_NATIVE_SETTINGS) {
        track('sheets_stage_change_sent', eventContext);
        await settingsApi.stageGoogleSheetsChange({
          connectorKey: 'pos_daily',
          sourceType: stagedSource,
          sourceId: stagedSource === 'oauth' ? stagedSavedConfig.sourceId : undefined,
          profileId: stagedSource === 'shared' ? stagedSavedConfig.profileId : undefined,
          spreadsheetId: selectedSheetId,
          spreadsheetTitle: selectedSheetName,
          sheetName: selectedTab,
          headerRow,
          mapping: normalizedMapping,
          transformations: transformsPayload,
        });
        track('sheets_stage_change_succeeded', eventContext);

        track('sheets_commit_change_sent', eventContext);
        const commitResponse = await settingsApi.commitGoogleSheetsChange({
          connectorKey: 'pos_daily',
          sourceType: stagedSource,
          sourceId: stagedSource === 'oauth' ? stagedSavedConfig.sourceId : undefined,
          profileId: stagedSource === 'shared' ? stagedSavedConfig.profileId : undefined,
          sourceName: stagedSource === 'oauth' ? selectedProfileName : undefined,
          profileName: stagedSource === 'shared' ? selectedProfileName : undefined,
          spreadsheetId: selectedSheetId,
          spreadsheetTitle: selectedSheetName,
          sheetName: selectedTab,
          headerRow,
          mapping: normalizedMapping,
          transformations: transformsPayload,
          activate: true,
        });
        track('sheets_commit_change_succeeded', eventContext);

        const commitData = commitResponse.data?.data as
          | {
              activeIntegration?: 'oauth' | 'shared' | null;
              activeSourceId?: string | null;
              activeProfileId?: string | null;
              activeConnectorKey?: string | null;
            }
          | undefined;

        await runInstantSync({
          connectorKey: commitData?.activeConnectorKey ?? 'pos_daily',
          integrationType: commitData?.activeIntegration ?? stagedSource,
          sourceId: commitData?.activeSourceId ?? null,
          profileId: commitData?.activeProfileId ?? null,
        });
        track('sheets_import_commit_succeeded', eventContext);
      } else {
        if (stagedSource === 'oauth') {
          await settingsApi.saveGoogleSource({
            sourceId: stagedSavedConfig.sourceId,
            name: selectedProfileName,
            spreadsheetTitle: selectedSheetName,
            spreadsheetId: selectedSheetId,
            range: `${selectedTab}!A1:Z`,
            mapping: normalizedMapping,
            transformations: transformsPayload,
            active: true,
          });
        } else {
          await settingsApi.saveGoogleSheetsMapping({
            mode: 'service_account',
            profileId: stagedSavedConfig.profileId,
            profileName: selectedProfileName,
            columnsMap: normalizedMapping,
            transformations: transformsPayload,
          });

          await settingsApi.configureSharedSheet({
            profileId: stagedSavedConfig.profileId,
            profileName: selectedProfileName,
            spreadsheetId: selectedSheetId,
            sheetName: selectedTab,
            headerRow,
            enabled: true,
          });
        }

        await settingsApi.setGoogleMode(toApiMode(stagedSource));
        await runInstantSync();
        track('sheets_import_commit_succeeded', eventContext);
      }
      await onSaved();
      setActiveStep(0);
      setWizardOpen(false);
      setCopyFromExisting(false);
    } catch (err: unknown) {
      track('sheets_commit_change_failed', eventContext);
      const message =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'Failed to save sheet configuration';
      setError(mapSheetsRuntimeErrorMessage(message));
      setSyncState(null);
    } finally {
      setBusy(false);
    }
  };

  const selectedSourceLabel = stagedSource === 'oauth' ? 'OAuth' : 'Shared';
  const serviceAccountLabel = settings.serviceAccountEmail?.trim() || DEFAULT_SERVICE_ACCOUNT_EMAIL;
  const persistedSharedSpreadsheetInput = selectedSheet?.id || stagedSavedConfig.spreadsheetId || '';
  const copyServiceAccountEmail = async () => {
    try {
      await navigator.clipboard.writeText(serviceAccountLabel);
    } catch {
      // ignore clipboard errors
    }
  };

  const closeWizard = () => {
    if (busy) return;
    setWizardOpen(false);
  };

  const handleContinue = () => {
    if (activeStep === 0) {
      setActiveStep(1);
      return;
    }
    if (activeStep === 1) {
      setActiveStep(2);
    }
  };

  const stepTwoContinueReason = useMemo(() => {
    if (busy || isBusy) return 'Please wait for the current action to finish.';
    if (!canEdit) return 'You do not have permission to continue.';
    if (!selectedSheet?.id) return 'Select a spreadsheet to continue.';
    if (!selectedTab) return 'Select a tab to continue.';
    if (headers.length === 0) return 'Load a valid header preview before continuing.';
    return null;
  }, [busy, canEdit, headers.length, isBusy, selectedSheet?.id, selectedTab]);

  const stepThreeCompatibility = useMemo(
    () =>
      getCompatibility({
        mappingByTarget: toMappingByTarget(normalizeMapping(headers, mapping)),
        derivedConfig: normalizeDerivedConfig(transforms, mapping),
        headers,
      }),
    [headers, mapping, transforms],
  );

  const saveDisabledReason = useMemo(() => {
    if (busy || isBusy) return 'Please wait for the current action to finish.';
    if (!canEdit) return 'You do not have permission to save.';
    if (!selectedSheet?.id || !selectedTab) return 'Select spreadsheet and tab before saving.';
    if (headers.length === 0) return 'No header preview available. Go back and load a valid sheet/tab.';
    if (Object.values(mapping).filter(Boolean).length === 0) return 'Map at least one field before saving.';
    if (stepThreeCompatibility.missingRequiredTargets.length > 0) {
      return `Missing required fields: ${stepThreeCompatibility.missingRequiredTargets.join(', ')}`;
    }
    if (stepThreeCompatibility.duplicateColumnUsage.length > 0) {
      return 'Resolve duplicate column assignments before saving.';
    }
    if (stepThreeCompatibility.invalidDerivedEquations.length > 0) {
      return 'Fix invalid calculated field equations before saving.';
    }
    if (stepThreeCompatibility.derivedDependencyIssues.length > 0) {
      return 'Resolve calculated field dependency issues before saving.';
    }
    return null;
  }, [busy, canEdit, headers.length, isBusy, mapping, selectedSheet?.id, selectedTab, stepThreeCompatibility]);

  const continueDisabledReason =
    activeStep === 0
      ? (busy || isBusy
          ? 'Please wait for the current action to finish.'
          : !canEdit
            ? 'You do not have permission to continue.'
            : continueBlockedReason)
      : activeStep === 1
        ? stepTwoContinueReason
        : null;
  const continueDisabled = Boolean(continueDisabledReason);
  const saveDisabled = Boolean(saveDisabledReason);

  useEffect(() => {
    if (stagedSource !== 'shared') return;
    if (sharedVerifyInput.trim().length > 0) return;
    if (!persistedSharedSpreadsheetInput) return;
    setSharedVerifyInput(persistedSharedSpreadsheetInput);
  }, [persistedSharedSpreadsheetInput, sharedVerifyInput, stagedSource]);

  useEffect(() => {
    if (!wizardOpen || activeStep !== 0) return;
    if (stagedSource !== 'oauth' || stagedSourceStatus === 'not_connected') return;

    let cancelled = false;
    void settingsApi
      .getGoogleSheetsOAuthStatus()
      .then((response) => {
        if (cancelled) return;
        const root = response.data as
          | { data?: { ok?: boolean; email?: string | null; scopes?: string[] | null; expiresInSec?: number | null } }
          | undefined;
        const payload = root?.data ?? {};
        if (!payload.ok) return;
        const nextEmail =
          typeof payload.email === 'string' && payload.email.trim().length > 0 ? payload.email.trim() : null;
        setOauthStatusEmail(nextEmail);
        setOauthStatusScopes(Array.isArray(payload.scopes) ? payload.scopes : null);
        setOauthStatusExpiresInSec(
          typeof payload.expiresInSec === 'number' && Number.isFinite(payload.expiresInSec)
            ? payload.expiresInSec
            : null,
        );
      })
      .catch(() => {
        // Best-effort status enrichment only.
      });

    return () => {
      cancelled = true;
    };
  }, [activeStep, stagedSource, stagedSourceStatus, wizardOpen]);

  return (
    <Dialog
      open={wizardOpen}
      onClose={() => {
        closeWizard();
      }}
      fullWidth
      maxWidth="lg"
    >
      <DialogTitle sx={{ pr: 1.5 }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1}>
          <Typography variant="h6">
            {activeSource ? `Change: ${selectedProfileName}` : `Setup: ${selectedProfileName}`} • Step {activeStep + 1} of 3
          </Typography>
          <Tooltip title="Close">
            <span>
              <IconButton aria-label="Close setup wizard" onClick={closeWizard} disabled={busy}>
                <CloseIcon />
              </IconButton>
            </span>
          </Tooltip>
        </Stack>
      </DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          {error ? (
            <Alert severity="error" onClose={() => setError(null)}>
              {error}
            </Alert>
          ) : null}

          {syncState ? (
            <Alert severity="success" variant="outlined">
              {syncState.stage}
            </Alert>
          ) : null}

          <Stepper activeStep={activeStep} alternativeLabel>
            {WIZARD_STEPS.map((label) => (
              <Step key={label}>
                <StepLabel>{label}</StepLabel>
              </Step>
            ))}
          </Stepper>

          {activeStep === 0 ? (
            <Paper variant="outlined" sx={{ p: 2 }}>
              <Stack spacing={2}>
                <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} justifyContent="space-between" alignItems={{ xs: 'flex-start', md: 'center' }}>
                  <Stack spacing={0.75}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                      {stepOneTitle}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {stepOneSubtitle}
                    </Typography>
                  </Stack>
                  <Box onClick={(event) => event.stopPropagation()} onMouseDown={(event) => event.stopPropagation()}>
                    <SourceSwitch
                      value={stagedSource}
                      onChange={handleSourceSwitch}
                      disabled={busy || isBusy || !canEdit}
                    />
                  </Box>
                </Stack>

                {stagedSource === 'oauth' && stagedSourceStatus === 'not_connected' ? (
                  <Alert
                    severity="warning"
                    action={
                      <Button size="small" onClick={() => void startOAuthConnect()} disabled={busy || isBusy}>
                        Connect Google
                      </Button>
                    }
                  >
                    OAuth is not connected. Connect OAuth to continue.
                  </Alert>
                ) : null}
                {stagedSource === 'oauth' && stagedSourceStatus === 'incomplete' ? (
                  <Paper variant="outlined" sx={{ p: 1.5 }}>
                    <Stack spacing={1}>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        OAuth source connected
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        {effectiveOAuthEmail ? `Connected account: ${effectiveOAuthEmail}` : 'OAuth connection is available.'}
                      </Typography>
                      {oauthStatusMetaLabel ? (
                        <Typography variant="caption" color="text.secondary">
                          {oauthStatusMetaLabel}
                        </Typography>
                      ) : null}
                      <Typography variant="body2" color="text.secondary">
                        Spreadsheet is not configured yet. Continue to Sheet & Preview to finish setup.
                      </Typography>
                      <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={1}>
                        <Typography variant="caption" color="text.secondary">
                          Last sync: {stagedLastSyncLabel}
                        </Typography>
                        <Stack direction="row" spacing={1}>
                          <Button
                            size="small"
                            variant="text"
                            onClick={() => void startOAuthConnect()}
                            disabled={busy || isBusy}
                          >
                            Change OAuth account
                          </Button>
                          <Button
                            size="small"
                            variant="outlined"
                            onClick={() => setActiveStep(1)}
                            disabled={busy || isBusy || !canEdit}
                          >
                            Continue
                          </Button>
                        </Stack>
                      </Stack>
                    </Stack>
                  </Paper>
                ) : null}

                {stagedSource === 'shared' ? (
                  <Paper variant="outlined" sx={{ p: 1.5 }}>
                    <Stack spacing={1.25}>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        {sharedContinueReady ? 'Shared source is verified.' : 'Shared source is not verified.'}
                      </Typography>
                      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ xs: 'stretch', sm: 'center' }}>
                        <Typography variant="body2" color="text.secondary" sx={{ flex: 1 }}>
                          Service account email: <strong>{serviceAccountLabel}</strong>
                        </Typography>
                        <Button
                          size="small"
                          variant="outlined"
                          startIcon={<ContentCopyIcon fontSize="small" />}
                          onClick={() => void copyServiceAccountEmail()}
                          sx={{ whiteSpace: 'nowrap' }}
                        >
                          Copy email
                        </Button>
                      </Stack>
                      <Stack spacing={0.4}>
                        <Typography variant="caption" color="text.secondary">
                          1. Open your Google Sheet and click Share.
                        </Typography>
                        <Stack direction="row" spacing={0.75} alignItems="center" flexWrap="wrap">
                          <Typography variant="caption" color="text.secondary">
                            2. Add <strong>{serviceAccountLabel}</strong> as Viewer/Editor, or set General access to
                            {' '}<strong>Anyone with the link</strong> (Viewer).
                          </Typography>
                          <Button
                            size="small"
                            variant="text"
                            onClick={() => void copyServiceAccountEmail()}
                            sx={{ minWidth: 0, px: 0.5, lineHeight: 1.4 }}
                          >
                            Copy email
                          </Button>
                        </Stack>
                        <Typography variant="caption" color="text.secondary">
                          3. Paste Spreadsheet ID or URL here, then click Verify access.
                        </Typography>
                      </Stack>
                      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ xs: 'stretch', sm: 'flex-start' }}>
                        <TextField
                          size="small"
                          label="Spreadsheet ID or URL"
                          value={sharedVerifyInput}
                          error={Boolean(sharedVerifyInput.trim()) && !Boolean(sharedVerifySpreadsheetId)}
                          helperText={
                            sharedVerifyInput.trim() && !sharedVerifySpreadsheetId
                              ? 'Enter a valid spreadsheet ID or Google Sheets URL.'
                              : undefined
                          }
                          onChange={(event) => {
                            setSharedVerifyInput(event.target.value);
                            setSharedVerified(false);
                          }}
                          sx={{ flex: 1 }}
                        />
                        <Button
                          size="small"
                          variant="contained"
                          onClick={() => void verifySharedAccess()}
                          disabled={busy || isBusy || !sharedVerifySpreadsheetId}
                          sx={{ whiteSpace: 'nowrap', height: 40, minHeight: 40 }}
                        >
                          {sharedContinueReady ? 'Verify again' : 'Verify access'}
                        </Button>
                      </Stack>
                    </Stack>
                  </Paper>
                ) : null}

                {activeSource && stagedSource !== activeSource ? (
                  <Alert severity="info" variant="outlined">
                    What will change: Active source will switch from {activeSource === 'oauth' ? 'OAuth' : 'Shared'} to {selectedSourceLabel}.
                  </Alert>
                ) : null}

                {activeSource && stagedSource !== activeSource ? (
                  <FormControlLabel
                    control={
                      <Checkbox
                        checked={copyFromExisting}
                        onChange={(_event, checked) => {
                          setCopyFromExisting(checked);
                          if (!checked) {
                            hydrateDraftFromSource(stagedSource);
                          }
                        }}
                      />
                    }
                    label="Copy from existing config"
                  />
                ) : null}

                <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={1}>
                  <Button
                    size="small"
                    variant="text"
                    onClick={() => onDebug?.(stagedSource === 'oauth' ? 'oauth' : 'shared')}
                    disabled={busy || isBusy}
                  >
                    {stagedSource === 'oauth' ? 'Debug OAuth' : 'Debug Shared'}
                  </Button>

                  <Stack direction="row" spacing={1.5} alignItems="center">
                    {(['oauth', 'shared'] as const).map((source) => {
                      const health = statusToHealth(statuses[source]);
                      const sourceLabel = source === 'oauth' ? 'OAuth' : 'Shared';
                      return (
                        <Tooltip key={source} title={`${sourceLabel}: ${getStatusLabel(statuses[source])}`}>
                          <Stack direction="row" spacing={0.5} alignItems="center">
                            <Box
                              sx={{
                                width: 10,
                                height: 10,
                                borderRadius: '50%',
                                bgcolor: health.color,
                                boxShadow: `0 0 0 2px ${health.light}`,
                              }}
                            />
                            <Typography variant="caption" color="text.secondary">
                              {sourceLabel}
                            </Typography>
                          </Stack>
                        </Tooltip>
                      );
                    })}
                  </Stack>
                </Stack>

              </Stack>
            </Paper>
          ) : null}

          {activeStep === 1 ? (
            <Paper variant="outlined" sx={{ p: 2 }}>
              <Stack spacing={2}>
                <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                  Source: {selectedSourceLabel}
                </Typography>

                <Stack direction={{ xs: 'column', lg: 'row' }} spacing={2} alignItems="stretch">
                  <Paper variant="outlined" sx={{ flex: 1, p: 1.5 }}>
                    <Stack spacing={1.25}>
                      <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                        Sheet selection
                      </Typography>
                      <TextField
                        size="small"
                        label="Search spreadsheets"
                        value={sheetSearch}
                        onChange={(event) => setSheetSearch(event.target.value)}
                      />
                      <Paper variant="outlined" sx={{ maxHeight: 240, overflow: 'auto' }}>
                        {busy && visibleFiles.length === 0 ? (
                          <Stack alignItems="center" py={3}>
                            <CircularProgress size={22} />
                          </Stack>
                        ) : (
                          <List dense disablePadding>
                            {visibleFiles.map((file) => (
                              <ListItemButton
                                key={file.id}
                                selected={selectedSheet?.id === file.id}
                                onClick={() => handleSelectSheet(file)}
                                disabled={busy || !canEdit}
                              >
                                <ListItemIcon sx={{ minWidth: 32 }}>
                                  <Box component="img" src="/google-sheets-icon.svg" alt="" sx={{ width: 18, height: 18 }} />
                                </ListItemIcon>
                                <ListItemText
                                  primary={file.name}
                                  secondary={file.modifiedTime ? new Date(file.modifiedTime).toLocaleString() : undefined}
                                  primaryTypographyProps={{ variant: 'body2', noWrap: true }}
                                />
                              </ListItemButton>
                            ))}
                            {visibleFiles.length === 0 ? (
                              <ListItemText
                                sx={{ px: 2, py: 1 }}
                                primary="No spreadsheets found for this source"
                                primaryTypographyProps={{ variant: 'body2', color: 'text.secondary' }}
                              />
                            ) : null}
                          </List>
                        )}
                      </Paper>
                    </Stack>
                  </Paper>

                  <Paper variant="outlined" sx={{ width: { xs: '100%', lg: 360 }, p: 1.5 }}>
                    <Stack spacing={1.25}>
                      <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                        Tab selection
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        Header row is fixed to 1.
                      </Typography>
                      <Paper variant="outlined" sx={{ maxHeight: 240, overflow: 'auto' }}>
                        {tabsLoading ? (
                          <Stack alignItems="center" py={3}>
                            <CircularProgress size={20} />
                          </Stack>
                        ) : (
                          <List dense disablePadding>
                            {tabs.map((tab) => (
                              <ListItemButton
                                key={tab.title}
                                selected={selectedTab === tab.title}
                                onClick={() => {
                                  setSelectedTab(tab.title);
                                  track('sheets_tab_selected', {
                                    spreadsheetId: selectedSheet?.id ?? null,
                                    sheetName: tab.title,
                                    reason: 'user-click',
                                  });
                                  lastPreviewKeyRef.current = '';
                                }}
                                disabled={busy || !canEdit || !selectedSheet?.id}
                              >
                                <ListItemIcon sx={{ minWidth: 32 }}>
                                  <GridOnIcon fontSize="small" color={selectedTab === tab.title ? 'primary' : 'action'} />
                                </ListItemIcon>
                                <ListItemText
                                  primary={tab.title}
                                  secondary={tab.rowCount != null ? `${tab.rowCount} rows` : undefined}
                                  primaryTypographyProps={{ variant: 'body2' }}
                                />
                              </ListItemButton>
                            ))}
                            {tabs.length === 0 ? (
                              <ListItemText
                                sx={{ px: 2, py: 1 }}
                                primary={selectedSheet?.id ? 'No tabs found for selected spreadsheet' : 'Select a spreadsheet first'}
                                primaryTypographyProps={{ variant: 'body2', color: 'text.secondary' }}
                              />
                            ) : null}
                          </List>
                        )}
                      </Paper>
                    </Stack>
                  </Paper>
                </Stack>

                <Paper variant="outlined" sx={{ p: 1.5 }}>
                  <Stack spacing={1}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                      Data preview
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Columns detected: {headers.length}
                    </Typography>

                    {sampleRows.length > 0 && previewColumns.length > 0 ? (
                      <Table size="small">
                        <TableHead>
                          <TableRow>
                            {previewColumns.slice(0, 8).map((column) => (
                              <TableCell key={column}>{column}</TableCell>
                            ))}
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {sampleRows.slice(0, 10).map((row, rowIndex) => (
                            <TableRow key={`row-${rowIndex}`}>
                              {previewColumns.slice(0, 8).map((_, colIndex) => (
                                <TableCell key={`cell-${rowIndex}-${colIndex}`}>{row[colIndex] || '—'}</TableCell>
                              ))}
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    ) : (
                      <Typography variant="body2" color="text.secondary">
                        {sampleRows.length > 0
                          ? 'No header row detected in row 1 for this tab. Showing generic columns.'
                          : 'No data preview yet. Select sheet and tab to load preview.'}
                      </Typography>
                    )}
                  </Stack>
                </Paper>

              </Stack>
            </Paper>
          ) : null}

          {activeStep === 2 ? (
            <Paper variant="outlined" sx={{ p: 2 }}>
              <Stack spacing={2}>
                <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                  Column mapping
                </Typography>

                {headers.length > 0 ? (
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
                ) : (
                  <Alert severity="warning">No header preview available. Go back and select a valid sheet/tab.</Alert>
                )}
              </Stack>
            </Paper>
          ) : null}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ width: '100%' }}>
          <Button variant="text" onClick={() => setActiveStep((prev) => Math.max(prev - 1, 0))} disabled={busy || activeStep === 0}>
            Back
          </Button>
          {activeStep < 2 ? (
            <Tooltip title={continueDisabledReason ?? ''} disableHoverListener={!continueDisabledReason}>
              <span>
                <Button variant="contained" onClick={handleContinue} disabled={continueDisabled}>
                  Continue
                </Button>
              </span>
            </Tooltip>
          ) : (
            <Tooltip title={saveDisabledReason ?? ''} disableHoverListener={!saveDisabledReason}>
              <span>
                <Button variant="contained" onClick={handleCommit} disabled={saveDisabled}>
                  {busy ? 'Saving…' : 'Save Mapping'}
                </Button>
              </span>
            </Tooltip>
          )}
        </Stack>
      </DialogActions>
    </Dialog>
  );
};
