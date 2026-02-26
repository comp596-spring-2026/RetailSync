import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Step,
  StepLabel,
  Stepper,
  Typography
} from '@mui/material';
import { useEffect, useMemo, useState } from 'react';
import { posApi } from '../api/posApi';
import { settingsApi } from '../api/settingsApi';
import { useAppDispatch } from '../app/store/hooks';
import { showSnackbar } from '../features/ui/uiSlice';
import { MatchingWizard } from './MatchingWizard';
import { TabSelectorDialog } from './TabSelectorDialog';

const STEPS = ['Source', 'Preview', 'Match', 'Confirm'];
const TARGET_FIELDS = ['date', 'sku', 'qty', 'price', 'name', 'barcode'];

type ImportPOSDataModalProps = {
  open: boolean;
  onClose: () => void;
  onImported?: () => Promise<void> | void;
};

type Suggestion = {
  col: string;
  header: string;
  suggestion: string;
  score: number;
};

type TabsResponse = {
  tabs: Array<{ title: string; rowCount: number | null; columnCount: number | null }>;
};

export const ImportPOSDataModal = ({ open, onClose, onImported }: ImportPOSDataModalProps) => {
  const dispatch = useAppDispatch();
  const [activeStep, setActiveStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [tabs, setTabs] = useState<TabsResponse['tabs']>([]);
  const [tabDialogOpen, setTabDialogOpen] = useState(false);
  const [selectedTab, setSelectedTab] = useState('');

  const [headers, setHeaders] = useState<string[]>([]);
  const [sampleRows, setSampleRows] = useState<string[][]>([]);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [transforms, setTransforms] = useState<Record<string, unknown>>({});
  const [rowErrors, setRowErrors] = useState<Array<{ rowIndex: number; errors: Array<{ col: string; message: string }> }>>([]);
  const [jobId, setJobId] = useState<string | null>(null);

  const resetState = () => {
    setActiveStep(0);
    setBusy(false);
    setError(null);
    setTabs([]);
    setTabDialogOpen(false);
    setSelectedTab('');
    setHeaders([]);
    setSampleRows([]);
    setSuggestions([]);
    setMapping({});
    setTransforms({});
    setRowErrors([]);
    setJobId(null);
  };

  const close = () => {
    resetState();
    onClose();
  };

  const mappedCount = useMemo(() => Object.values(mapping).filter(Boolean).length, [mapping]);

  const loadTabs = async (openPicker = false) => {
    try {
      setBusy(true);
      setError(null);
      const response = await settingsApi.listTabs();
      const result = response.data.data as TabsResponse;
      setTabs(result.tabs ?? []);
      if (!selectedTab && result.tabs?.[0]) {
        setSelectedTab(result.tabs[0].title);
      }
      setTabDialogOpen(openPicker);
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Unable to fetch spreadsheet tabs');
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    if (activeStep !== 0) return;
    if (tabs.length > 0) return;
    void loadTabs(false);
  }, [open, activeStep]);

  const preview = async () => {
    try {
      setBusy(true);
      setError(null);
      const response = await posApi.previewSheet({ source: 'service', tab: selectedTab, maxRows: 20 });
      const data = response.data.data as {
        header: string[];
        sampleRows: string[][];
        suggestions: Suggestion[];
      };
      setHeaders(data.header ?? []);
      setSampleRows(data.sampleRows ?? []);
      setSuggestions(data.suggestions ?? []);
      const initial = Object.fromEntries(
        (data.suggestions ?? []).map((entry) => [entry.header, entry.suggestion])
      );
      setMapping(initial);
      setActiveStep(2);
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Preview failed');
    } finally {
      setBusy(false);
    }
  };

  const validateMapping = async () => {
    try {
      setBusy(true);
      setError(null);
      const response = await posApi.validateMapping({ mapping, transforms, validateSample: true });
      const data = response.data.data as {
        valid: boolean;
        rowErrors: Array<{ rowIndex: number; errors: Array<{ col: string; message: string }> }>;
      };
      setRowErrors(data.rowErrors ?? []);
      if (!data.valid) return;
      setActiveStep(3);
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Mapping validation failed');
    } finally {
      setBusy(false);
    }
  };

  const commit = async () => {
    try {
      setBusy(true);
      setError(null);
      const response = await posApi.commitImport({ mapping, transforms, options: { tab: selectedTab } });
      const id = (response.data.data as { jobId?: string }).jobId ?? null;
      setJobId(id);
      dispatch(showSnackbar({ message: 'POS import queued', severity: 'success' }));
      await onImported?.();
      close();
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Commit failed');
    } finally {
      setBusy(false);
    }
  };

  const renderStepBody = () => {
    if (activeStep === 0) {
      return (
        <Stack spacing={2}>
          <Alert severity="info">Source type: Google Sheets (Service Account).</Alert>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={1}>
            <Button variant="outlined" onClick={() => void loadTabs(false)} disabled={busy}>
              Reload Tabs
            </Button>
            <Button
              variant="text"
              onClick={() => {
                if (tabs.length > 0) {
                  setTabDialogOpen(true);
                  return;
                }
                void loadTabs(true);
              }}
              disabled={busy}
            >
              Open Tab Picker
            </Button>
          </Stack>
          <FormControl fullWidth size="small">
            <InputLabel id="sheet-tab-select-label">Sheet Tab</InputLabel>
            <Select
              labelId="sheet-tab-select-label"
              label="Sheet Tab"
              value={selectedTab}
              onChange={(event) => setSelectedTab(String(event.target.value))}
            >
              {tabs.map((tab) => (
                <MenuItem key={tab.title} value={tab.title}>
                  {tab.title}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          {tabs.length === 0 && (
            <Alert severity="warning">
              No tabs found. Configure and verify your shared spreadsheet in Settings first.
            </Alert>
          )}
          {selectedTab ? (
            <Alert severity="info">Selected tab: {selectedTab}</Alert>
          ) : (
            <Alert severity="warning">Choose a tab before continuing.</Alert>
          )}
        </Stack>
      );
    }

    if (activeStep === 1) {
      return (
        <Stack spacing={2}>
          <Typography variant="body2">
            Preview fetches the header row and first sample rows from the selected tab.
          </Typography>
          <Button variant="contained" onClick={preview} disabled={busy || !selectedTab}>
            Load Preview
          </Button>
        </Stack>
      );
    }

    if (activeStep === 2) {
      return (
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
      );
    }

    return (
      <Stack spacing={2}>
        <Alert severity="success">
          Ready to commit import with {mappedCount} mapped fields.
        </Alert>
        {jobId && <Typography variant="body2">Last queued job: {jobId}</Typography>}
      </Stack>
    );
  };

  return (
    <>
      <Dialog open={open} onClose={close} fullWidth maxWidth="lg">
        <DialogTitle>Import POS Data</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2}>
            <Stepper activeStep={activeStep}>
              {STEPS.map((label) => (
                <Step key={label}>
                  <StepLabel>{label}</StepLabel>
                </Step>
              ))}
            </Stepper>
            {error && <Alert severity="error">{error}</Alert>}
            <Box>{renderStepBody()}</Box>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => setActiveStep((value) => Math.max(value - 1, 0))}
            disabled={busy || activeStep === 0}
          >
            Back
          </Button>
          {activeStep < 2 && (
            <Button
              onClick={() => setActiveStep((value) => Math.min(value + 1, 3))}
              disabled={busy || (activeStep === 0 && !selectedTab)}
            >
              Next
            </Button>
          )}
          {activeStep === 2 && (
            <Button variant="contained" onClick={validateMapping} disabled={busy || mappedCount === 0}>
              Validate Mapping
            </Button>
          )}
          {activeStep === 3 && (
            <Button variant="contained" onClick={commit} disabled={busy || mappedCount === 0}>
              Commit Import
            </Button>
          )}
          <Button color="inherit" onClick={close} disabled={busy}>
            Cancel
          </Button>
        </DialogActions>
      </Dialog>

      <TabSelectorDialog
        open={tabDialogOpen}
        tabs={tabs}
        selectedTab={selectedTab}
        onClose={() => setTabDialogOpen(false)}
        onSelect={(tab) => {
          setSelectedTab(tab);
          setTabDialogOpen(false);
        }}
      />
    </>
  );
};
