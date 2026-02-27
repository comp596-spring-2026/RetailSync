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
  FormControl,
  IconButton,
  InputLabel,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  MenuItem,
  Paper,
  Select,
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
import StorageIcon from '@mui/icons-material/Storage';
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
import { posApi, settingsApi } from '../../api';
import { useAppDispatch } from '../../app/store/hooks';
import { showSnackbar } from '../../slices/ui/uiSlice';
import { MatchingWizard } from './MatchingWizard';

type SourceType = 'file' | 'google_sheets' | 'pos_db';
type GoogleAuthMode = 'oauth' | 'service_account';
type Suggestion = { col: string; header: string; suggestion: string; score: number };
type TabInfo = { title: string; rowCount: number | null; columnCount: number | null };
type OAuthSheetFile = { id: string; name: string; modifiedTime: string | null; owner?: string | null; ownerEmail?: string | null };

type ImportPOSDataModalProps = {
  open: boolean;
  onClose: () => void;
  onImported?: () => Promise<void> | void;
};

const ACCEPTED_EXTENSIONS = ['csv', 'xlsx', 'xls'];
const MAX_FILE_SIZE_MB = 10;
const TARGET_FIELDS = [
  'date',
  'highTax',
  'lowTax',
  'saleTax',
  'gas',
  'lottery',
  'creditCard',
  'lotteryPayout',
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

const SOURCE_OPTIONS: Array<{ id: SourceType; label: string; desc: string; icon: React.ReactNode; comingSoon: boolean }> = [
  { id: 'file', label: 'File Import', desc: 'Upload CSV or Excel', icon: <CloudUploadIcon sx={{ fontSize: 32 }} />, comingSoon: false },
  {
    id: 'google_sheets',
    label: 'Google Sheets',
    desc: 'Connect via OAuth or share',
    icon: (
      <Box
        component="img"
        src="/google-sheets-icon.svg"
        alt="Google Sheets"
        sx={{ width: 32, height: 32 }}
      />
    ),
    comingSoon: false
  },
  { id: 'pos_db', label: 'POS / Database', desc: 'Direct integration', icon: <StorageIcon sx={{ fontSize: 32, color: '#5C6BC0' }} />, comingSoon: true }
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

export const ImportPOSDataModal = ({ open, onClose, onImported }: ImportPOSDataModalProps) => {
  const dispatch = useAppDispatch();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [phase, setPhase] = useState<'source' | 'connect' | 'pick_sheet' | 'sheets' | 'upload' | 'match' | 'confirm'>('source');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedSource, setSelectedSource] = useState<SourceType | null>(null);
  const [googleAuthMode, setGoogleAuthMode] = useState<GoogleAuthMode | null>(null);
  const [googleConnected, setGoogleConnected] = useState(false);
  const [googleConnectedEmail, setGoogleConnectedEmail] = useState<string | null>(null);
  const [savedMapping, setSavedMapping] = useState<Record<string, string>>({});
  const [savedTransforms, setSavedTransforms] = useState<Record<string, unknown>>({});

  const [spreadsheetInput, setSpreadsheetInput] = useState('');
  const [oauthFiles, setOauthFiles] = useState<OAuthSheetFile[]>([]);
  const [oauthSearch, setOauthSearch] = useState('');
  const [selectedOAuthSheet, setSelectedOAuthSheet] = useState<OAuthSheetFile | null>(null);
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
  const [validated, setValidated] = useState(false);

  const mappedCount = useMemo(() => Object.values(mapping).filter(Boolean).length, [mapping]);

  const resetState = () => {
    setPhase('source');
    setBusy(false);
    setError(null);
    setSelectedSource(null);
    setGoogleAuthMode(null);
    setGoogleConnected(false);
    setGoogleConnectedEmail(null);
    setSavedMapping({});
    setSavedTransforms({});
    setSpreadsheetInput('');
    setOauthFiles([]);
    setOauthSearch('');
    setSelectedOAuthSheet(null);
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
    setValidated(false);
  };

  const close = () => { resetState(); onClose(); };

  /* ── API actions ── */

  const loadSettings = async () => {
    try {
      const res = await settingsApi.get();
      const gs = res.data?.data?.googleSheets;
      if (gs?.serviceAccountEmail) setServiceAccountEmail(gs.serviceAccountEmail);
      if (gs?.sharedConfig?.spreadsheetId) setSpreadsheetInput(gs.sharedConfig.spreadsheetId);
      setGoogleConnected(Boolean(gs?.connected));
      setGoogleConnectedEmail(gs?.connectedEmail ?? null);
      const columnsMap =
        (gs?.sharedConfig?.columnsMap && Object.keys(gs.sharedConfig.columnsMap).length > 0
          ? gs.sharedConfig.columnsMap
          : gs?.sharedConfig?.lastMapping?.columnsMap) ?? {};
      setSavedMapping(columnsMap);
      setSavedTransforms(gs?.sharedConfig?.lastMapping?.transformations ?? {});
    } catch { /* best-effort */ }
  };

  const loadTabs = async () => {
    try {
      setBusy(true);
      setError(null);
      const res = await settingsApi.listTabs();
      const loaded = ((res.data.data as any)?.tabs ?? (res.data.data as any)?.tabs) as TabInfo[] ?? [];
      setTabs(loaded);
      if (loaded.length === 0) setError('No tabs found. Verify sheet ID and sharing permissions.');
      return loaded;
    } catch (err: any) {
      const msg = err?.response?.data?.message ?? 'Unable to fetch tabs';
      setError(msg.includes('No spreadsheet configured') ? 'Enter a Spreadsheet ID first.' : msg);
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
      setValidated(false);
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
    if (open && selectedSource === 'google_sheets') void loadSettings();
  }, [open, selectedSource]);

  const validateMapping = async () => {
    if (mappedCount === 0) { setError('Map at least one column.'); return; }
    const mappedTargets = new Set(Object.values(mapping).filter(Boolean));
    const missingRequired = REQUIRED_TARGET_FIELDS.filter((t) => !mappedTargets.has(t));
    if (missingRequired.length > 0) {
      setError(`Missing required fields: ${missingRequired.join(', ')}`);
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
        setValidated(false);
        return;
      }
      setValidated(true);
      setPhase('confirm');
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Validation failed');
      setValidated(false);
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

  const goToSource = () => { setPhase('source'); setError(null); };

  const selectSource = (src: SourceType) => {
    if (src === 'pos_db') return;
    setSelectedSource(src);
    setError(null);
    setGoogleAuthMode(null);
    if (src === 'file') setPhase('upload');
    else setPhase('connect');
  };

  const selectAuthMode = (mode: GoogleAuthMode) => {
    setGoogleAuthMode(mode);
    setError(null);
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

      setPhase('sheets');
    })();
  };

  const filteredOAuthFiles = useMemo(() => {
    const q = oauthSearch.trim().toLowerCase();
    const base = q ? oauthFiles.filter((f) => f.name.toLowerCase().includes(q)) : oauthFiles;
    const lastUsedId = spreadsheetInput ? extractSpreadsheetId(spreadsheetInput) : '';
    if (!lastUsedId) return base;
    return [...base].sort((a, b) => {
      if (a.id === lastUsedId) return -1;
      if (b.id === lastUsedId) return 1;
      return 0;
    });
  }, [oauthFiles, oauthSearch, spreadsheetInput]);

  /* ── Step indicators ── */
  const stepsForStepper = useMemo(() => {
    if (!selectedSource) return ['Source'];
    if (selectedSource === 'file') return ['Source', 'Upload', 'Confirm'];
    return googleAuthMode === 'oauth'
      ? ['Source', 'Connect', 'Pick Sheet', 'Sheet & Tab', 'Match', 'Confirm']
      : ['Source', 'Connect', 'Sheet & Tab', 'Match', 'Confirm'];
  }, [selectedSource]);

  const stepIndex = useMemo(() => {
    const map: Record<string, number> = {
      source: 0,
      connect: selectedSource === 'file' ? 1 : 1,
      upload: 1,
      pick_sheet: 2,
      sheets: googleAuthMode === 'oauth' ? 3 : 2,
      match: selectedSource === 'file' ? -1 : 3,
      confirm: selectedSource === 'file' ? 2 : 4
    };
    return map[phase] ?? 0;
  }, [phase, selectedSource, googleAuthMode]);

  /* ── Renderers ── */

  const renderSourcePhase = () => (
    <Stack spacing={2}>
      <Typography variant="body2" color="text.secondary">Select a data source to begin importing POS data.</Typography>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr 1fr' }, gap: 2 }}>
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
                  {disabled && <Chip label="Coming Soon" size="small" sx={{ mt: 1.5 }} />}
                </CardContent>
              </CardActionArea>
            </Card>
          );
        })}
      </Box>
    </Stack>
  );

  const renderConnectPhase = () => (
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

  const renderSheetsPhase = () => (
    <Box sx={{ display: 'flex', gap: 2, height: 420, minHeight: 420 }}>
      {/* Left: Config + Tab list */}
      <Paper variant="outlined" sx={{ width: 320, flexShrink: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Service account email */}
        {serviceAccountEmail && (
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
              <Typography variant="caption" color="text.secondary">Enter a spreadsheet ID to load tabs</Typography>
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
      <Typography variant="body2" color="text.secondary">Upload a CSV or Excel file. Max: {MAX_FILE_SIZE_MB} MB.</Typography>
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
      onChangeMapping={m => { setMapping(m); setValidated(false); }}
      onChangeTransforms={t => { setTransforms(t); setValidated(false); }}
    />
  );

  const renderConfirmPhase = () => (
    <Stack spacing={2}>
      <Paper variant="outlined" sx={{ p: 3, textAlign: 'center' }}>
        <CheckCircleOutlineIcon sx={{ fontSize: 48, color: 'success.main', mb: 1 }} />
        <Typography variant="h6" gutterBottom>Ready to Import</Typography>
        {selectedSource === 'google_sheets' && (
          <Typography variant="body2" color="text.secondary">
            All rows from tab <strong>{selectedTab}</strong> with <strong>{mappedCount}</strong> mapped column{mappedCount !== 1 ? 's' : ''}.
          </Typography>
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
                      void loadTabs();
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
      case 'connect': setPhase('source'); break;
      case 'sheets': setPhase('connect'); break;
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
        {phase !== 'source' && <Button color="inherit" onClick={close} disabled={busy}>Cancel</Button>}
      </DialogActions>
    </Dialog>
  );
};
