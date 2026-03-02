import {
  Alert,
  alpha,
  Box,
  Button,
  Card,
  CardActionArea,
  CardContent,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
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
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography
} from '@mui/material';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import GoogleIcon from '@mui/icons-material/Google';
import ShareIcon from '@mui/icons-material/Share';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile';
import LockOpenIcon from '@mui/icons-material/LockOpen';
import DescriptionIcon from '@mui/icons-material/Description';
import GridOnIcon from '@mui/icons-material/GridOn';
import RefreshIcon from '@mui/icons-material/Refresh';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import { useEffect, useMemo, useRef, useState } from 'react';
import { posApi } from '../api';
import { settingsApi } from '../../settings/api';
import { useAppDispatch, useAppSelector } from '../../../app/store/hooks';
import { showSnackbar } from '../../../app/store/uiSlice';
import { fetchSettings, selectSettings } from '../../settings/state';
import { MatchingWizard } from './MatchingWizard';

type SourceType = 'file' | 'google_sheets';
type GoogleAuthMode = 'oauth' | 'service_account';
type Suggestion = { col: string; header: string; suggestion: string; score: number };
type TabInfo = { title: string; rowCount: number | null; columnCount: number | null };
type OAuthSheetFile = { id: string; name: string; modifiedTime: string | null; owner?: string | null; ownerEmail?: string | null };
type SharedSheetFile = { id: string; name: string; modifiedTime: string | null };

type GoogleSheetsConfigStatus = {
  configured: boolean;
  sheetTitle?: string | null;
  lastImportAt?: string | null;
};

type ImportPOSDataModalProps = {
  open: boolean;
  onClose: () => void;
  onImported?: () => Promise<void> | void;
  /** When provided (e.g. from POS page), Google Sheets option can redirect to Settings POS sheet configuration. */
  navigateToSettings?: () => void;
};

const ACCEPTED_EXTENSIONS = ['xlsx', 'xls'];
const MAX_FILE_SIZE_MB = 10;
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
  'clTotal',
  'cash',
  'cashPayout',
  'cashExpenses',
  'notes'
];

const REQUIRED_TARGET_FIELDS = [
  'date',
  'highTax',
  'lowTax',
  'saleTax',
  'gas',
  'lottery',
  'creditCard',
  'lotteryPayout',
  'cashExpenses'
];

const TARGET_LABELS: Record<string, string> = {
  date: 'Date',
  highTax: 'High Tax',
  lowTax: 'Low Tax',
  saleTax: 'Sale Tax',
  gas: 'Gas',
  lottery: 'Lottery',
  creditCard: 'Credit Card',
  lotteryPayout: 'Lottery Payout',
  cashExpenses: 'Cash Expenses'
};

const normalizeTargetValue = (target: string) => {
  const trimmed = String(target ?? '').trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('custom:')) {
    return `custom:${trimmed.replace(/^custom:/, '').trim().toLowerCase()}`;
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

const SOURCE_OPTIONS: Array<{ id: SourceType; label: string; desc: string; icon: React.ReactNode; comingSoon: boolean }> = [
  { id: 'file', label: 'Import Excel', desc: 'Upload .xlsx or .xls', icon: <CloudUploadIcon sx={{ fontSize: 32 }} />, comingSoon: false },
  {
    id: 'google_sheets',
    label: 'Google Sheets',
    desc: 'Open POS sheet settings',
    icon: (
      <Box
        component="img"
        src="/google-sheets-icon.svg"
        alt="Google Sheets"
        sx={{ width: 32, height: 32 }}
      />
    ),
    comingSoon: false
  }
];

const validateFile = (file: File): string | null => {
  const ext = file.name.split('.').pop()?.toLowerCase();
  if (!ext || !ACCEPTED_EXTENSIONS.includes(ext)) return `Unsupported file. Accepted: ${ACCEPTED_EXTENSIONS.map(e => `.${e}`).join(', ')}`;
  if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) return `File too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Max: ${MAX_FILE_SIZE_MB} MB.`;
  if (file.size === 0) return 'File is empty.';
  return null;
};

const extractSpreadsheetId = (input: string): string => {
  const trimmed = input.trim();
  const m = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  return m ? m[1] : trimmed;
};

const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
};

export const ImportPOSDataModal = ({ open, onClose, onImported, navigateToSettings }: ImportPOSDataModalProps) => {
  const dispatch = useAppDispatch();
  const settingsFromRedux = useAppSelector(selectSettings);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [phase, setPhase] = useState<'source' | 'connect' | 'pick_sheet' | 'sheets' | 'upload' | 'match' | 'confirm' | 'google_ready' | 'google_setup_required'>('source');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedSource, setSelectedSource] = useState<SourceType | null>(null);
  const [googleAuthMode, setGoogleAuthMode] = useState<GoogleAuthMode | null>(null);
  const [configuredMode, setConfiguredMode] = useState<GoogleAuthMode | null>(null);
  const [googleConnected, setGoogleConnected] = useState(false);
  const [savedMapping, setSavedMapping] = useState<Record<string, string>>({});
  const [savedTransforms, setSavedTransforms] = useState<Record<string, unknown>>({});
  const [googleSheetsConfig, setGoogleSheetsConfig] = useState<GoogleSheetsConfigStatus | null>(null);

  const [spreadsheetInput, setSpreadsheetInput] = useState('');
  const [oauthFiles, setOauthFiles] = useState<OAuthSheetFile[]>([]);
  const [sharedSheetFiles, setSharedSheetFiles] = useState<SharedSheetFile[]>([]);
  const [oauthSearch, setOauthSearch] = useState('');
  const [lastOAuthSpreadsheetId, setLastOAuthSpreadsheetId] = useState('');
  const [selectedOAuthSheet, setSelectedOAuthSheet] = useState<OAuthSheetFile | null>(null);
  const [selectedSharedSheet, setSelectedSharedSheet] = useState<{ id: string; name: string } | null>(null);
  const [tabs, setTabs] = useState<TabInfo[]>([]);
  const [selectedTab, setSelectedTab] = useState('');
  const [serviceAccountEmail, setServiceAccountEmail] = useState('');
  const [previewLoading, setPreviewLoading] = useState(false);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);

  const [headers, setHeaders] = useState<string[]>([]);
  const [sampleRows, setSampleRows] = useState<string[][]>([]);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [transforms, setTransforms] = useState<Record<string, unknown>>({});
  const [rowErrors, setRowErrors] = useState<Array<{ rowIndex: number; errors: Array<{ col: string; message: string }> }>>([]);

  const mappedCount = useMemo(() => Object.values(mapping).filter(Boolean).length, [mapping]);

  const resetState = () => {
    setPhase('source');
    setBusy(false);
    setError(null);
    setSelectedSource(null);
    setGoogleAuthMode(null);
    setConfiguredMode(null);
    setGoogleConnected(false);
    setSavedMapping({});
    setSavedTransforms({});
    setGoogleSheetsConfig(null);
    setSpreadsheetInput('');
    setOauthFiles([]);
    setSharedSheetFiles([]);
    setOauthSearch('');
    setLastOAuthSpreadsheetId('');
    setSelectedOAuthSheet(null);
    setSelectedSharedSheet(null);
    setTabs([]);
    setSelectedTab('');
    setServiceAccountEmail('');
    setPreviewLoading(false);
    setSelectedFile(null);
    setFileError(null);
    setHeaders([]);
    setSampleRows([]);
    setSuggestions([]);
    setMapping({});
    setTransforms({});
    setRowErrors([]);
  };

  const close = () => { resetState(); onClose(); };

  /* ── API actions ── */

  const syncSettingsFromRedux = () => {
    const gs = settingsFromRedux?.googleSheets;
    if (!gs) return;
    setConfiguredMode(gs.mode === 'oauth' ? 'oauth' : 'service_account');
    if (gs.serviceAccountEmail) setServiceAccountEmail(gs.serviceAccountEmail);
    if (gs.mode === 'service_account' && gs.sharedConfig?.spreadsheetId) {
      setSpreadsheetInput(gs.sharedConfig.spreadsheetId);
    } else {
      setSpreadsheetInput('');
    }
    const activeSource = gs.sources.find((source) => source.active) ?? gs.sources[0];
    setLastOAuthSpreadsheetId(activeSource?.spreadsheetId ? extractSpreadsheetId(activeSource.spreadsheetId) : '');
    setGoogleConnected(Boolean(gs.connected));
    const sharedProfile =
      gs.sharedSheets?.find((sheet) => String(sheet?.name ?? '').trim().toUpperCase() === 'POS DATA SHEET')
      ?? gs.sharedSheets?.find((sheet) => sheet?.isDefault)
      ?? gs.sharedSheets?.[0];
    const oauthSource =
      gs.sources?.find((source) => String(source?.name ?? '').trim().toUpperCase() === 'POS DATA SHEET')
      ?? gs.sources?.find((source) => source?.active)
      ?? gs.sources?.[0];

    const sharedMapped = sharedProfile?.columnsMap ?? sharedProfile?.lastMapping?.columnsMap ?? {};
    const oauthMapped = oauthSource?.mapping ?? {};
    const sharedConfigured =
      Boolean(sharedProfile?.spreadsheetId?.trim()) &&
      Boolean(sharedProfile?.enabled) &&
      Object.keys(sharedMapped).length > 0;
    const oauthConfigured =
      Boolean(oauthSource?.spreadsheetId?.trim()) &&
      Object.keys(oauthMapped).length > 0;

    const configured = sharedConfigured || oauthConfigured;
    const effectiveMap = sharedConfigured ? sharedMapped : oauthMapped;
    setSavedMapping(effectiveMap ?? {});
    setSavedTransforms(
      sharedConfigured
        ? (sharedProfile?.lastMapping?.transformations ?? {})
        : (oauthSource?.transformations ?? {})
    );

    setGoogleSheetsConfig({
      configured,
      sheetTitle:
        (sharedConfigured
          ? sharedProfile?.spreadsheetTitle
          : oauthSource?.spreadsheetTitle ?? oauthSource?.name) ??
        sharedProfile?.spreadsheetId ??
        oauthSource?.spreadsheetId ??
        null,
      lastImportAt:
        sharedProfile?.lastImportAt ??
        gs.sharedConfig?.lastImportAt ??
        null
    });
  };

  const loadTabs = async (explicitSpreadsheetId?: string) => {
    try {
      setBusy(true);
      setError(null);
      const fromState =
        googleAuthMode === 'oauth'
          ? selectedOAuthSheet?.id
          : (selectedSharedSheet?.id ?? (spreadsheetInput.trim() || undefined));
      const spreadsheetIdOverride = explicitSpreadsheetId ?? fromState;
      if (!spreadsheetIdOverride) {
        setError('Select a spreadsheet first, or enter a Spreadsheet ID.');
        return [];
      }
      const res = await settingsApi.listTabsWithSpreadsheetId({
        spreadsheetId: spreadsheetIdOverride,
        authMode: googleAuthMode ?? "service_account",
      });
      const loaded = ((res.data.data as any)?.tabs ?? (res.data.data as any)?.tabs) as TabInfo[] ?? [];
      setTabs(loaded);
      if (loaded.length === 0) setError('No tabs found. Verify sheet ID and sharing permissions.');
      return loaded;
    } catch (err: any) {
      const msg = err?.response?.data?.message ?? 'Unable to fetch tabs';
      setError(msg.includes('No spreadsheet configured') ? 'Select a spreadsheet first.' : msg);
      return [];
    } finally {
      setBusy(false);
    }
  };

  const saveSheetAndLoadTabs = async () => {
    const id = extractSpreadsheetId(spreadsheetInput);
    if (!id) { setError('Enter a valid Spreadsheet ID or URL.'); return; }
    try {
      setBusy(true);
      setError(null);
      await settingsApi.configureSharedSheet({ spreadsheetId: id, headerRow: 1, enabled: true });
      const loaded = await loadTabs();
      if (loaded.length > 0) {
        setSelectedTab(loaded[0].title);
        void loadPreview(loaded[0].title);
      }
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Failed to save spreadsheet config');
    } finally {
      setBusy(false);
    }
  };

  const loadOAuthFiles = async () => {
    try {
      setBusy(true);
      setError(null);
      const res = await settingsApi.listOAuthSpreadsheets();
      const files = (res.data?.data?.files ?? []) as OAuthSheetFile[];
      setOauthFiles(files);
      if (files.length === 0) setError('No spreadsheets found for this Google account.');
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Unable to list spreadsheets');
    } finally {
      setBusy(false);
    }
  };

  const loadSharedSpreadsheets = async () => {
    try {
      setBusy(true);
      setError(null);
      const res = await settingsApi.listSharedSpreadsheets();
      const files = (res.data?.data?.files ?? []) as SharedSheetFile[];
      setSharedSheetFiles(files);
      if (files.length === 0) setError('No spreadsheets shared with the service account. Share a sheet with the email above first.');
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Unable to list shared spreadsheets');
    } finally {
      setBusy(false);
    }
  };

  const startOAuth = async () => {
    try {
      setBusy(true);
      setError(null);
      const res = await settingsApi.getGoogleConnectUrl();
      const url = res.data?.data?.url;
      if (url) window.location.href = url;
      else setError('Could not get authorization URL.');
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'OAuth initialization failed');
    } finally {
      setBusy(false);
    }
  };

  const loadPreview = async (tab: string) => {
    if (!tab) return;
    try {
      setPreviewLoading(true);
      setError(null);
      const source = googleAuthMode === 'oauth' ? 'oauth' : 'service';
      const spreadsheetId = googleAuthMode === 'oauth' ? (selectedOAuthSheet?.id ?? '') : undefined;
      const res = await posApi.previewSheet({ source, tab, maxRows: 20, spreadsheetId: spreadsheetId || undefined, headerRow: 1 });
      const data = res.data.data as { header: string[]; sampleRows: string[][]; suggestions: Suggestion[] };
      if (!data.header?.length) { setError('No columns found. Check the header row.'); return; }
      setHeaders(data.header);
      setSampleRows(data.sampleRows ?? []);
      setSuggestions(data.suggestions ?? []);
      const suggested = Object.fromEntries((data.suggestions ?? []).map(s => [s.header, s.suggestion]));
      const merged = { ...suggested, ...(Object.keys(savedMapping).length > 0 ? savedMapping : {}) };
      setMapping(merged);
      if (Object.keys(savedTransforms).length > 0) setTransforms(savedTransforms);
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Preview failed.');
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleTabSelect = (tab: string) => {
    setSelectedTab(tab);
    void loadPreview(tab);
  };

  useEffect(() => {
    if (open) void dispatch(fetchSettings());
  }, [open, dispatch]);

  useEffect(() => {
    if (settingsFromRedux) syncSettingsFromRedux();
  }, [settingsFromRedux]);

  useEffect(() => {
    if (
      navigateToSettings &&
      selectedSource === 'google_sheets' &&
      phase === 'connect' &&
      googleSheetsConfig?.configured
    ) {
      setPhase('google_ready');
    }
  }, [navigateToSettings, selectedSource, phase, googleSheetsConfig]);

  useEffect(() => {
    if (navigateToSettings) return;
    if (phase === 'connect' && selectedSource === 'google_sheets' && googleConnected) {
      setPhase('pick_sheet');
      void loadOAuthFiles();
    }
  }, [navigateToSettings, phase, selectedSource, googleConnected]);

  const validateMapping = async () => {
    if (mappedCount === 0) { setError('Map at least one column.'); return; }
    const duplicateTargets = getDuplicateTargets(mapping);
    if (duplicateTargets.length > 0) {
      setError(
        `One-to-one mapping required. Remove duplicates: ${duplicateTargets
          .map((field) => TARGET_LABELS[field] ?? field)
          .join(', ')}.`
      );
      return;
    }
    const mappedTargets = new Set(Object.values(mapping).filter(Boolean));
    const missingRequired = REQUIRED_TARGET_FIELDS.filter((t) => !mappedTargets.has(t));
    if (missingRequired.length > 0) {
      setError(
        `Please map required fields: ${missingRequired
          .map((field) => TARGET_LABELS[field] ?? field)
          .join(', ')}.`
      );
      return;
    }
    try {
      setBusy(true);
      setError(null);
      setRowErrors([]);
      const spreadsheetId = googleAuthMode === 'oauth' ? (selectedOAuthSheet?.id ?? '') : undefined;
      const res = await posApi.validateMapping({ mapping, transforms, validateSample: true, tab: selectedTab, spreadsheetId: spreadsheetId || undefined, headerRow: 1 });
      const data = res.data.data as { valid: boolean; rowErrors: Array<{ rowIndex: number; errors: Array<{ col: string; message: string }> }> };
      setRowErrors(data.rowErrors ?? []);
      if (!data.valid) {
        setError(`Validation found ${data.rowErrors?.length ?? 0} issue(s). Fix mapping and retry.`);
        return;
      }
      await settingsApi.saveGoogleSheetsMapping({
        mode: googleAuthMode === 'oauth' ? 'oauth' : 'service_account',
        columnsMap: mapping,
        transformations: Object.keys(transforms).length > 0 ? transforms : undefined
      });
      setPhase('confirm');
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Validation failed');
    } finally {
      setBusy(false);
    }
  };

  const commitSheets = async () => {
    try {
      setBusy(true);
      setError(null);
      const spreadsheetId = googleAuthMode === 'oauth' ? (selectedOAuthSheet?.id ?? '') : undefined;
      await posApi.commitImport({ mapping, transforms, options: { tab: selectedTab, spreadsheetId: spreadsheetId || undefined, headerRow: 1 } });
      dispatch(showSnackbar({ message: 'POS data imported from Google Sheets', severity: 'success' }));
      await onImported?.();
      close();
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Import failed');
    } finally {
      setBusy(false);
    }
  };

  const commitUsingSavedConfig = async () => {
    try {
      setBusy(true);
      setError(null);
      const settingsRes = await settingsApi.get();
      const gs = settingsRes.data?.data?.googleSheets as any;
      const parseRangeTab = (range?: string) => {
        if (!range) return "Sheet1";
        const tab = String(range).split("!")[0]?.trim();
        return tab ? tab.replace(/^'/, "").replace(/'$/, "") : "Sheet1";
      };
      let payload: { mapping: Record<string, string>; transforms?: Record<string, unknown>; options?: Record<string, unknown> } | null = null;
      if (gs?.mode === "oauth") {
        const source =
          gs?.sources?.find((entry: any) => String(entry?.name ?? "").trim().toUpperCase() === "POS DATA SHEET")
          ?? gs?.sources?.find((entry: any) => entry?.active)
          ?? gs?.sources?.[0];
        if (source?.spreadsheetId) {
          payload = {
            mapping: source.mapping ?? {},
            transforms: source.transformations ?? {},
            options: {
              mode: "oauth",
              sourceId: source.sourceId,
              profileName: source.name,
              spreadsheetId: source.spreadsheetId,
              tab: parseRangeTab(source.range),
              headerRow: 1,
            },
          };
        }
      } else {
        const sharedProfile =
          gs?.sharedSheets?.find((sheet: any) => String(sheet?.name ?? "").trim().toUpperCase() === "POS DATA SHEET")
          ?? gs?.sharedSheets?.find((sheet: any) => sheet?.isDefault)
          ?? gs?.sharedSheets?.[0];
        if (sharedProfile?.spreadsheetId) {
          payload = {
            mapping: sharedProfile.columnsMap ?? sharedProfile.lastMapping?.columnsMap ?? {},
            transforms: sharedProfile.lastMapping?.transformations ?? {},
            options: {
              mode: "service_account",
              profileId: sharedProfile.profileId,
              profileName: sharedProfile.name,
              tab: sharedProfile.sheetName ?? "Sheet1",
              headerRow: Number(sharedProfile.headerRow ?? 1),
            },
          };
        }
      }
      if (!payload || Object.keys(payload.mapping ?? {}).length === 0) {
        throw new Error("No saved mapping found. Configure sheet mapping first.");
      }
      await posApi.commitImport(payload);
      dispatch(showSnackbar({ message: 'POS data imported from Google Sheets', severity: 'success' }));
      await onImported?.();
      close();
    } catch (err: any) {
      setError(err?.response?.data?.message ?? err?.message ?? 'Import failed');
    } finally {
      setBusy(false);
    }
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    setFileError(null);
    setError(null);
    if (!file) { setSelectedFile(null); return; }
    const err = validateFile(file);
    if (err) { setFileError(err); setSelectedFile(null); return; }
    setSelectedFile(file);
  };

  const commitFile = async () => {
    if (!selectedFile) { setError('No file selected.'); return; }
    const err = validateFile(selectedFile);
    if (err) { setError(err); return; }
    try {
      setBusy(true);
      setError(null);
      await posApi.importFile(selectedFile);
      dispatch(showSnackbar({ message: 'File imported successfully', severity: 'success' }));
      await onImported?.();
      close();
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'File import failed');
    } finally {
      setBusy(false);
    }
  };

  const handleCommit = () => {
    if (selectedSource === 'google_sheets') void commitSheets();
    else if (selectedSource === 'file') void commitFile();
  };

  /* ── Phase navigation helpers ── */
  const selectSource = (src: SourceType) => {
    setSelectedSource(src);
    setError(null);
    setGoogleAuthMode(null);
    if (src === 'file') {
      setPhase('upload');
      return;
    }
    if (navigateToSettings) {
      navigateToSettings();
      close();
      return;
    }
    if (googleSheetsConfig?.configured && configuredMode === 'service_account') {
      setPhase('google_ready');
      return;
    }
    setPhase('connect');
  };

  const selectAuthMode = (mode: GoogleAuthMode) => {
    setGoogleAuthMode(mode);
    setError(null);
    if (mode === 'oauth') {
      setSelectedSharedSheet(null);
      setSpreadsheetInput('');
      setSharedSheetFiles([]);
    } else {
      setSelectedOAuthSheet(null);
      setOauthSearch('');
      setOauthFiles([]);
    }
    void (async () => {
      try {
        await settingsApi.setGoogleMode(mode === 'oauth' ? 'oauth' : 'service_account');
      } catch {
        // best-effort; endpoints can still infer mode from server settings
      }

      if (mode === 'oauth' && !googleConnected) {
        await startOAuth();
        return;
      }

      if (mode === 'oauth') {
        setPhase('pick_sheet');
        await loadOAuthFiles();
        return;
      }

      setPhase('pick_sheet');
      await loadSharedSpreadsheets();
    })();
  };

  const filteredOAuthFiles = useMemo(() => {
    const q = oauthSearch.trim().toLowerCase();
    const base = q ? oauthFiles.filter((f) => f.name.toLowerCase().includes(q)) : oauthFiles;
    const lastUsedId = lastOAuthSpreadsheetId;
    if (!lastUsedId) return base;
    return [...base].sort((a, b) => {
      if (a.id === lastUsedId) return -1;
      if (b.id === lastUsedId) return 1;
      return 0;
    });
  }, [oauthFiles, oauthSearch, lastOAuthSpreadsheetId]);

  /* ── Step indicators ── */
  const stepsForStepper = useMemo(() => {
    if (!selectedSource) return ['Source'];
    if (selectedSource === 'file') return ['Source', 'Upload', 'Confirm'];
    if (phase === 'google_ready' || phase === 'google_setup_required') return ['Source', 'Google Sheets'];
    return ['Source', 'Connect', 'Pick Sheet', 'Sheet & Tab', 'Match', 'Confirm'];
  }, [selectedSource, phase]);

  const stepIndex = useMemo(() => {
    const map: Record<string, number> = {
      source: 0,
      connect: 1,
      upload: 1,
      pick_sheet: 2,
      sheets: 3,
      match: selectedSource === 'file' ? -1 : 4,
      confirm: selectedSource === 'file' ? 2 : 5,
      google_ready: 1,
      google_setup_required: 1
    };
    return map[phase] ?? 0;
  }, [phase, selectedSource]);

  /* ── Renderers ── */

  const renderSourcePhase = () => (
    <Stack spacing={2}>
      <Typography variant="body2" color="text.secondary">Select a data source to begin importing POS data.</Typography>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
        {SOURCE_OPTIONS.map(opt => {
          const disabled = opt.comingSoon;
          const selected = selectedSource === opt.id;
          return (
            <Card key={opt.id} variant="outlined" sx={{
              opacity: disabled ? 0.5 : 1,
              border: selected ? 2 : 1,
              borderColor: selected ? 'primary.main' : 'divider',
              bgcolor: selected ? t => alpha(t.palette.primary.main, 0.04) : undefined,
              transition: 'all 0.15s'
            }}>
              <CardActionArea disabled={disabled} onClick={() => selectSource(opt.id)} sx={{ height: '100%' }}>
                <CardContent sx={{ textAlign: 'center', py: 3 }}>
                  <Box sx={{ mb: 1 }}>{opt.icon}</Box>
                  <Typography variant="subtitle1" fontWeight={600}>{opt.label}</Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>{opt.desc}</Typography>
                  {opt.id === 'google_sheets' && (
                    <Chip
                      label={googleSheetsConfig?.configured ? 'POS sheet configured' : 'POS sheet not configured'}
                      size="small"
                      color={googleSheetsConfig?.configured ? 'success' : 'default'}
                      variant="outlined"
                      sx={{ mt: 1.5 }}
                    />
                  )}
                  {disabled && <Chip label="Coming Soon" size="small" sx={{ mt: 1.5 }} />}
                </CardContent>
              </CardActionArea>
            </Card>
          );
        })}
      </Box>
    </Stack>
  );

  const renderConnectPhase = () => {
    if (navigateToSettings && selectedSource === 'google_sheets' && googleSheetsConfig === null) {
      return (
        <Stack spacing={2} alignItems="center" sx={{ py: 4 }}>
          <CircularProgress size={32} />
          <Typography variant="body2" color="text.secondary">Checking Google Sheets setup...</Typography>
        </Stack>
      );
    }
    return (
      <Stack spacing={2}>
        <Typography variant="body2" color="text.secondary">How should RetailSync access your Google Sheet?</Typography>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
          {[
            { id: 'oauth' as GoogleAuthMode, label: 'Sign in with Google', desc: 'Authorize via Google account', icon: <GoogleIcon sx={{ fontSize: 28, color: '#4285F4' }} /> },
            { id: 'service_account' as GoogleAuthMode, label: 'Share with Service Account', desc: 'Share spreadsheet with our email', icon: <ShareIcon sx={{ fontSize: 28, color: '#0F9D58' }} /> }
          ].map(opt => {
            const selected = googleAuthMode === opt.id;
            return (
              <Card key={opt.id} variant="outlined" sx={{
                border: selected ? 2 : 1,
                borderColor: selected ? 'primary.main' : 'divider',
                bgcolor: selected ? t => alpha(t.palette.primary.main, 0.04) : undefined,
                transition: 'all 0.15s'
              }}>
                <CardActionArea onClick={() => selectAuthMode(opt.id)} sx={{ height: '100%' }}>
                  <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2, py: 2.5 }}>
                    {opt.icon}
                    <Box>
                      <Typography variant="subtitle2" fontWeight={600}>{opt.label}</Typography>
                      <Typography variant="caption" color="text.secondary">{opt.desc}</Typography>
                    </Box>
                  </CardContent>
                </CardActionArea>
              </Card>
            );
          })}
        </Box>
        {googleAuthMode === 'oauth' && (
          <Alert severity="info" icon={<LockOpenIcon fontSize="small" />}>Redirecting to Google for authorization...</Alert>
        )}
      </Stack>
    );
  };

  const renderGoogleReadyPhase = () => (
    <Stack spacing={2}>
      <Alert severity="success" icon={<CheckCircleOutlineIcon />}>
        POS Google Sheet is already configured in Settings.
      </Alert>
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Stack spacing={0.5}>
          <Typography variant="subtitle2" color="text.secondary">Current sheet</Typography>
          <Typography variant="body1" fontWeight={600}>{googleSheetsConfig?.sheetTitle ?? '—'}</Typography>
          {googleSheetsConfig?.lastImportAt && (
            <Typography variant="caption" color="text.secondary">
              Last synced: {new Date(googleSheetsConfig.lastImportAt).toLocaleString()}
            </Typography>
          )}
        </Stack>
      </Paper>
      <Typography variant="body2" color="text.secondary">
        Use Settings → Integrations → Google Sheets to change sheet, tab, or mapping.
      </Typography>
    </Stack>
  );

  const renderGoogleSetupRequiredPhase = () => (
    <Stack spacing={2}>
      <Alert severity="info">
        Google Sheets is not set up yet. Configure it once in Settings (connect, pick sheet, map columns). Then you can import from here with one click.
      </Alert>
      <Typography variant="body2" color="text.secondary">
        In Settings you will: connect with Google (OAuth or share with service account), choose your spreadsheet and tab, map columns to POS fields, and optionally enable scheduled sync.
      </Typography>
    </Stack>
  );

  const renderSheetsPhase = () => (
    <Box sx={{ display: 'flex', gap: 2, height: 420, minHeight: 420 }}>
      {/* Left: Config + Tab list */}
      <Paper variant="outlined" sx={{ width: 320, flexShrink: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Service account email */}
        {googleAuthMode === 'service_account' && serviceAccountEmail && (
          <Box sx={{ p: 1.5, borderBottom: 1, borderColor: 'divider' }}>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>Share with this email:</Typography>
            <Stack direction="row" spacing={0.5} alignItems="center">
              <Typography variant="caption" sx={{ flex: 1, fontFamily: 'monospace', fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {serviceAccountEmail}
              </Typography>
              <Tooltip title="Copy">
                <IconButton size="small" onClick={() => {
                  void navigator.clipboard.writeText(serviceAccountEmail);
                  dispatch(showSnackbar({ message: 'Copied', severity: 'info' }));
                }}>
                  <ContentCopyIcon sx={{ fontSize: 14 }} />
                </IconButton>
              </Tooltip>
            </Stack>
          </Box>
        )}

        {/* Sheet selection (Shared) */}
        {googleAuthMode !== 'oauth' && (
          <Box sx={{ p: 1.5, borderBottom: 1, borderColor: 'divider' }}>
            {selectedSharedSheet ? (
              <>
                <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={1}>
                  <Typography variant="caption" color="text.secondary">Selected sheet:</Typography>
                  <Button size="small" variant="text" onClick={() => { setSelectedSharedSheet(null); setTabs([]); setHeaders([]); setSampleRows([]); setPhase('pick_sheet'); void loadSharedSpreadsheets(); }} disabled={busy}>
                    Change
                  </Button>
                </Stack>
                <Typography variant="body2" fontWeight={600} sx={{ mt: 0.5 }} noWrap title={selectedSharedSheet.name}>
                  {selectedSharedSheet.name}
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                  {selectedSharedSheet.id ? `ID: ${selectedSharedSheet.id.slice(0, 10)}…` : ''}
                </Typography>
                <Button
                  variant="contained"
                  size="small"
                  fullWidth
                  sx={{ mt: 1 }}
                  onClick={() => void loadTabs()}
                  disabled={busy}
                  startIcon={busy ? <CircularProgress size={14} color="inherit" /> : undefined}
                >
                  {busy ? 'Loading...' : 'Load Tabs'}
                </Button>
              </>
            ) : (
              <>
                <TextField
                  label="Spreadsheet ID or URL"
                  placeholder="Paste ID or full URL"
                  value={spreadsheetInput}
                  onChange={e => setSpreadsheetInput(e.target.value)}
                  fullWidth
                  size="small"
                  sx={{ mb: 1 }}
                />
                <Button
                  variant="contained"
                  size="small"
                  fullWidth
                  onClick={saveSheetAndLoadTabs}
                  disabled={busy || !spreadsheetInput.trim()}
                  startIcon={busy ? <CircularProgress size={14} color="inherit" /> : undefined}
                >
                  {busy ? 'Loading...' : 'Load Tabs'}
                </Button>
              </>
            )}
          </Box>
        )}

        {/* Sheet selection (OAuth) */}
        {googleAuthMode === 'oauth' && (
          <Box sx={{ p: 1.25, borderBottom: 1, borderColor: 'divider' }}>
            <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={1}>
              <Typography variant="caption" color="text.secondary">
                Selected sheet:
              </Typography>
              <Button size="small" variant="text" onClick={() => { setSelectedTab(''); setTabs([]); setHeaders([]); setSampleRows([]); setPhase('pick_sheet'); }} disabled={busy}>
                Change
              </Button>
            </Stack>
            <Typography variant="body2" fontWeight={600} sx={{ mt: 0.5 }} noWrap title={selectedOAuthSheet?.name ?? ''}>
              {selectedOAuthSheet?.name ?? '—'}
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
              {selectedOAuthSheet?.id ? `ID: ${selectedOAuthSheet.id.slice(0, 10)}…` : ''}
            </Typography>
            <Button
              variant="contained"
              size="small"
              fullWidth
              sx={{ mt: 1 }}
              onClick={() => void loadTabs()}
              disabled={busy || !selectedOAuthSheet?.id}
            >
              Load Tabs
            </Button>
          </Box>
        )}

        {/* Tab list */}
        <Box sx={{ flex: 1, overflow: 'auto' }}>
          {tabs.length > 0 && (
            <List dense disablePadding>
              {tabs.map(tab => (
                <ListItemButton
                  key={tab.title}
                  selected={selectedTab === tab.title}
                  onClick={() => handleTabSelect(tab.title)}
                >
                  <ListItemIcon sx={{ minWidth: 32 }}>
                    <GridOnIcon fontSize="small" color={selectedTab === tab.title ? 'primary' : 'action'} />
                  </ListItemIcon>
                  <ListItemText
                    primary={tab.title}
                    secondary={tab.rowCount != null ? `${tab.rowCount} rows` : undefined}
                    primaryTypographyProps={{ variant: 'body2', fontWeight: selectedTab === tab.title ? 600 : 400 }}
                    secondaryTypographyProps={{ variant: 'caption' }}
                  />
                </ListItemButton>
              ))}
            </List>
          )}
          {tabs.length === 0 && !busy && (
            <Box sx={{ p: 2, textAlign: 'center' }}>
              <Typography variant="caption" color="text.secondary">
                {googleAuthMode === 'oauth' ? 'Select a spreadsheet to load tabs' : 'Enter a spreadsheet ID to load tabs'}
              </Typography>
            </Box>
          )}
        </Box>

        {tabs.length > 0 && (
          <Box sx={{ p: 1, borderTop: 1, borderColor: 'divider' }}>
            <Button size="small" fullWidth startIcon={<RefreshIcon />} onClick={() => void loadTabs()} disabled={busy}>
              Reload Tabs
            </Button>
          </Box>
        )}
      </Paper>

      {/* Right: Preview table */}
      <Paper variant="outlined" sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <Box sx={{ p: 1.5, borderBottom: 1, borderColor: 'divider', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Typography variant="subtitle2">
            {selectedTab ? `Preview: ${selectedTab}` : 'Select a tab to preview'}
          </Typography>
          {selectedTab && headers.length > 0 && (
            <Chip label={`${headers.length} cols · ${sampleRows.length} rows`} size="small" variant="outlined" />
          )}
        </Box>
        <Box sx={{ flex: 1, overflow: 'auto' }}>
          {previewLoading && (
            <Stack alignItems="center" justifyContent="center" sx={{ height: '100%' }}>
              <CircularProgress size={32} />
              <Typography variant="caption" color="text.secondary" sx={{ mt: 1 }}>Loading preview...</Typography>
            </Stack>
          )}
          {!previewLoading && headers.length === 0 && (
            <Stack alignItems="center" justifyContent="center" sx={{ height: '100%' }}>
              <DescriptionIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
              <Typography variant="body2" color="text.secondary">
                {selectedTab ? 'No preview data' : 'Click a tab on the left to preview its data'}
              </Typography>
            </Stack>
          )}
          {!previewLoading && headers.length > 0 && (
            <TableContainer>
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 600, bgcolor: 'action.hover', width: 40 }}>#</TableCell>
                    {headers.map(h => (
                      <TableCell key={h} sx={{ fontWeight: 600, bgcolor: 'action.hover', whiteSpace: 'nowrap' }}>{h}</TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {sampleRows.map((row, ri) => (
                    <TableRow key={ri} hover>
                      <TableCell sx={{ color: 'text.secondary' }}>{ri + 1}</TableCell>
                      {headers.map((_, ci) => (
                        <TableCell key={ci} sx={{ whiteSpace: 'nowrap', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {row[ci] ?? ''}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </Box>
      </Paper>
    </Box>
  );

  const renderUploadPhase = () => (
    <Stack spacing={2}>
      <Typography variant="body2" color="text.secondary">Upload an Excel file (.xlsx or .xls). Max: {MAX_FILE_SIZE_MB} MB.</Typography>
      <input ref={fileInputRef} type="file" accept={ACCEPTED_EXTENSIONS.map(e => `.${e}`).join(',')} onChange={handleFileSelect} style={{ display: 'none' }} />
      <Paper variant="outlined" sx={{
        p: 4, textAlign: 'center', cursor: 'pointer', borderStyle: 'dashed', borderWidth: 2,
        borderColor: selectedFile ? 'success.main' : 'divider',
        bgcolor: selectedFile ? t => alpha(t.palette.success.main, 0.03) : undefined,
        '&:hover': { borderColor: 'primary.main', bgcolor: t => alpha(t.palette.primary.main, 0.02) },
        transition: 'all 0.15s'
      }} onClick={() => fileInputRef.current?.click()}>
        {selectedFile ? (
          <Stack alignItems="center" spacing={1}>
            <InsertDriveFileIcon sx={{ fontSize: 40, color: 'success.main' }} />
            <Typography variant="subtitle2">{selectedFile.name}</Typography>
            <Typography variant="caption" color="text.secondary">{formatBytes(selectedFile.size)}</Typography>
            <Button size="small" variant="text">Change File</Button>
          </Stack>
        ) : (
          <Stack alignItems="center" spacing={1}>
            <CloudUploadIcon sx={{ fontSize: 40, color: 'text.secondary' }} />
            <Typography variant="subtitle2">Click to choose a file</Typography>
            <Typography variant="caption" color="text.secondary">Supports {ACCEPTED_EXTENSIONS.map(e => `.${e}`).join(', ')}</Typography>
          </Stack>
        )}
      </Paper>
      {fileError && <Alert severity="error">{fileError}</Alert>}
    </Stack>
  );

  const renderMatchPhase = () => (
    <MatchingWizard
      headers={headers}
      sampleRows={sampleRows}
      suggestions={suggestions}
      mapping={mapping}
      transforms={transforms}
      targetFields={TARGET_FIELDS}
      rowErrors={rowErrors}
      onChangeMapping={m => { setMapping(m); }}
      onChangeTransforms={t => { setTransforms(t); }}
    />
  );

  const confirmSpreadsheetId =
    selectedSource === 'google_sheets'
      ? (googleAuthMode === 'oauth' ? selectedOAuthSheet?.id : selectedSharedSheet?.id ?? spreadsheetInput.trim())
      : null;
  const confirmSheetName =
    selectedSource === 'google_sheets'
      ? (googleAuthMode === 'oauth' ? selectedOAuthSheet?.name : selectedSharedSheet?.name ?? null)
      : null;

  const renderConfirmPhase = () => (
    <Stack spacing={2}>
      <Paper variant="outlined" sx={{ p: 3, textAlign: 'center' }}>
        <CheckCircleOutlineIcon sx={{ fontSize: 48, color: 'success.main', mb: 1 }} />
        <Typography variant="h6" gutterBottom>Ready to Import</Typography>
        {selectedSource === 'google_sheets' && (
          <Stack spacing={0.5} alignItems="center" sx={{ mt: 1 }}>
            {confirmSheetName && (
              <Typography variant="body2" fontWeight={600}>
                {confirmSheetName}
              </Typography>
            )}
            <Typography variant="body2" color="text.secondary">
              Tab <strong>{selectedTab}</strong> · <strong>{mappedCount}</strong> mapped column{mappedCount !== 1 ? 's' : ''}.
            </Typography>
            {confirmSpreadsheetId && (
              <Typography
                component="a"
                variant="body2"
                href={`https://docs.google.com/spreadsheets/d/${confirmSpreadsheetId}`}
                target="_blank"
                rel="noopener noreferrer"
                sx={{ color: 'primary.main', mt: 0.5 }}
              >
                Open original sheet
              </Typography>
            )}
          </Stack>
        )}
        {selectedSource === 'file' && selectedFile && (
          <Typography variant="body2" color="text.secondary">
            <strong>{selectedFile.name}</strong> ({formatBytes(selectedFile.size)}) will be imported.
          </Typography>
        )}
        <Divider sx={{ my: 2 }} />
        <Typography variant="caption" color="text.secondary">
          Existing records for the same dates will be updated (upsert). This cannot be undone.
        </Typography>
      </Paper>
    </Stack>
  );

  const renderContent = () => {
    switch (phase) {
      case 'source': return renderSourcePhase();
      case 'connect': return renderConnectPhase();
      case 'pick_sheet':
        if (googleAuthMode === 'service_account') {
          return (
            <Stack spacing={2}>
              {serviceAccountEmail && (
                <Alert severity="info" sx={{ py: 0.5 }}>
                  <Typography variant="caption" component="span" sx={{ fontWeight: 600 }}>Share with this email:</Typography>
                  <Typography variant="caption" component="span" sx={{ display: 'block', fontFamily: 'monospace', wordBreak: 'break-all' }}>
                    {serviceAccountEmail}
                  </Typography>
                </Alert>
              )}
              <Stack direction="row" justifyContent="space-between" alignItems="center">
                <Typography variant="body2" color="text.secondary">Select a spreadsheet shared with the service account.</Typography>
                <Button size="small" variant="outlined" onClick={() => void loadSharedSpreadsheets()} disabled={busy} startIcon={<RefreshIcon />}>
                  Refresh
                </Button>
              </Stack>
              <Paper variant="outlined" sx={{ maxHeight: 420, overflow: 'auto' }}>
                <List dense disablePadding>
                  {sharedSheetFiles.map((f) => (
                    <ListItemButton
                      key={f.id}
                      selected={selectedSharedSheet?.id === f.id}
                      disabled={busy}
                      onClick={async () => {
                        try {
                          setBusy(true);
                          setError(null);
                          await settingsApi.configureSharedSheet({ spreadsheetId: f.id, headerRow: 1, enabled: true });
                          setSpreadsheetInput(f.id);
                          setSelectedSharedSheet({ id: f.id, name: f.name });
                          setPhase('sheets');
                          await loadTabs(f.id);
                        } catch (err: any) {
                          setError(err?.response?.data?.message ?? 'Failed to load sheet');
                        } finally {
                          setBusy(false);
                        }
                      }}
                    >
                      <ListItemIcon sx={{ minWidth: 32 }}>
                        <Box
                          component="img"
                          src="/google-sheets-icon.svg"
                          alt="Google Sheets"
                          sx={{ width: 18, height: 18, opacity: selectedSharedSheet?.id === f.id ? 1 : 0.7 }}
                        />
                      </ListItemIcon>
                      <ListItemText
                        primary={f.name}
                        secondary={f.modifiedTime ? new Date(f.modifiedTime).toLocaleString() : undefined}
                        primaryTypographyProps={{ variant: 'body2', fontWeight: selectedSharedSheet?.id === f.id ? 600 : 400, noWrap: true }}
                        secondaryTypographyProps={{ variant: 'caption' }}
                      />
                    </ListItemButton>
                  ))}
                  {sharedSheetFiles.length === 0 && !busy && (
                    <Box sx={{ p: 2, textAlign: 'center' }}>
                      <Typography variant="caption" color="text.secondary">No spreadsheets shared yet. Share one with the email above.</Typography>
                    </Box>
                  )}
                </List>
              </Paper>
              <Stack direction="row" justifyContent="flex-end" spacing={1}>
                <Button variant="outlined" onClick={() => setPhase('connect')}>Back</Button>
              </Stack>
            </Stack>
          );
        }
        return (
          <Stack spacing={2}>
            <Stack direction="row" justifyContent="space-between" alignItems="center">
              <Typography variant="body2" color="text.secondary">Select a spreadsheet from your Google Drive.</Typography>
              <Button size="small" variant="outlined" onClick={() => void loadOAuthFiles()} disabled={busy} startIcon={<RefreshIcon />}>
                Refresh
              </Button>
            </Stack>
            <TextField
              size="small"
              label="Search spreadsheets"
              value={oauthSearch}
              onChange={(e) => setOauthSearch(e.target.value)}
              fullWidth
            />
            <Paper variant="outlined" sx={{ maxHeight: 420, overflow: 'auto' }}>
              <List dense disablePadding>
                {filteredOAuthFiles.map((f) => (
                  <ListItemButton
                    key={f.id}
                    selected={selectedOAuthSheet?.id === f.id}
                    onClick={() => {
                      setSelectedOAuthSheet(f);
                      setPhase('sheets');
                      void loadTabs(f.id);
                    }}
                  >
                    <ListItemIcon sx={{ minWidth: 32 }}>
                      <Box
                        component="img"
                        src="/google-sheets-icon.svg"
                        alt="Google Sheets"
                        sx={{
                          width: 18,
                          height: 18,
                          opacity: selectedOAuthSheet?.id === f.id ? 1 : 0.7
                        }}
                      />
                    </ListItemIcon>
                    <ListItemText
                      primary={f.name}
                      secondary={f.modifiedTime ? new Date(f.modifiedTime).toLocaleString() : undefined}
                      primaryTypographyProps={{ variant: 'body2', fontWeight: selectedOAuthSheet?.id === f.id ? 600 : 400, noWrap: true }}
                      secondaryTypographyProps={{ variant: 'caption' }}
                    />
                  </ListItemButton>
                ))}
                {filteredOAuthFiles.length === 0 && (
                  <Box sx={{ p: 2, textAlign: 'center' }}>
                    <Typography variant="caption" color="text.secondary">No spreadsheets found</Typography>
                  </Box>
                )}
              </List>
            </Paper>
            <Stack direction="row" justifyContent="flex-end" spacing={1}>
              <Button variant="outlined" onClick={() => setPhase('connect')}>Back</Button>
            </Stack>
          </Stack>
        );
      case 'sheets': return renderSheetsPhase();
      case 'upload': return renderUploadPhase();
      case 'match': return renderMatchPhase();
      case 'confirm': return renderConfirmPhase();
      case 'google_ready': return renderGoogleReadyPhase();
      case 'google_setup_required': return renderGoogleSetupRequiredPhase();
    }
  };

  /* ── Actions ── */

  const canProceed = (): boolean => {
    switch (phase) {
      case 'upload': return !!selectedFile && !fileError;
      case 'sheets': return headers.length > 0 && !!selectedTab;
      default: return false;
    }
  };

  const handleProceed = () => {
    setError(null);
    if (phase === 'upload') { setPhase('confirm'); return; }
    if (phase === 'sheets') { setPhase('match'); return; }
  };

  const handleBack = () => {
    setError(null);
    switch (phase) {
      case 'connect':
      case 'google_ready':
      case 'google_setup_required':
        setPhase('source');
        break;
      case 'pick_sheet': setPhase('connect'); break;
      case 'sheets':
        setPhase(googleAuthMode === 'service_account' ? 'pick_sheet' : 'connect');
        break;
      case 'upload': setPhase('source'); break;
      case 'match': setPhase('sheets'); break;
      case 'confirm':
        if (selectedSource === 'file') setPhase('upload');
        else setPhase('match');
        break;
    }
  };

  return (
    <Dialog open={open} onClose={close} fullWidth maxWidth="lg" PaperProps={{ sx: { minHeight: phase === 'sheets' ? 560 : undefined } }}>
      <DialogTitle sx={{ pb: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
        Import POS Data
        {selectedSource && (
          <Chip
            size="small"
            label={selectedSource === 'file' ? 'File' : 'Google Sheets'}
            icon={selectedSource === 'file' ? <InsertDriveFileIcon /> : <GoogleIcon />}
            variant="outlined"
            color={selectedSource === 'file' ? 'default' : 'success'}
          />
        )}
      </DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          {stepsForStepper.length > 1 && (
            <Stepper activeStep={stepIndex} alternativeLabel sx={{ pt: 0.5 }}>
              {stepsForStepper.map(label => (
                <Step key={label}><StepLabel>{label}</StepLabel></Step>
              ))}
            </Stepper>
          )}
          {error && <Alert severity="error" onClose={() => setError(null)}>{error}</Alert>}
          <Box sx={{ minHeight: phase === 'sheets' ? undefined : 200 }}>{renderContent()}</Box>
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 1.5 }}>
        <Button onClick={phase === 'source' ? close : handleBack} disabled={busy}>
          {phase === 'source' ? 'Cancel' : 'Back'}
        </Button>
        <Box sx={{ flex: 1 }} />
        {phase === 'google_ready' && (
          <>
            <Button
              variant="outlined"
              onClick={() => {
                setError(null);
                setSelectedOAuthSheet(null);
                setSelectedSharedSheet(null);
                setTabs([]);
                setHeaders([]);
                setSampleRows([]);
                setSelectedTab('');
                setPhase('connect');
              }}
              disabled={busy}
            >
              Change Sheet
            </Button>
            {navigateToSettings && (
              <Button variant="contained" onClick={() => { navigateToSettings(); close(); }} disabled={busy}>
                Open POS Sheet Settings
              </Button>
            )}
            {!navigateToSettings && (
              <Button variant="contained" color="success" onClick={commitUsingSavedConfig} disabled={busy}
                startIcon={busy ? <CircularProgress size={16} color="inherit" /> : <CheckCircleOutlineIcon />}>
                {busy ? 'Importing...' : 'Import now'}
              </Button>
            )}
          </>
        )}
        {phase === 'google_setup_required' && navigateToSettings && (
          <Button variant="contained" onClick={() => { navigateToSettings(); close(); }} disabled={busy}>
            Open POS Sheet Settings
          </Button>
        )}
        {(phase === 'upload' || phase === 'sheets') && (
          <Button variant="contained" onClick={handleProceed} disabled={busy || !canProceed()}>
            {phase === 'sheets' ? 'Map Columns' : 'Next'}
          </Button>
        )}
        {phase === 'match' && (
          <Button variant="contained" onClick={validateMapping} disabled={busy || mappedCount === 0}>
            {busy ? 'Validating...' : 'Validate & Continue'}
          </Button>
        )}
        {phase === 'confirm' && (
          <Button variant="contained" color="success" onClick={handleCommit} disabled={busy}
            startIcon={busy ? <CircularProgress size={16} color="inherit" /> : <CheckCircleOutlineIcon />}>
            {busy ? 'Importing...' : 'Commit Import'}
          </Button>
        )}
        {phase !== 'source' && phase !== 'google_ready' && phase !== 'google_setup_required' && (
          <Button color="inherit" onClick={close} disabled={busy}>Cancel</Button>
        )}
      </DialogActions>
    </Dialog>
  );
};
