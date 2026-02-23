import {
  Alert,
  Box,
  Button,
  Card,
  CardActionArea,
  CardContent,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  Grid2 as Grid,
  IconButton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import LinkIcon from "@mui/icons-material/Link";
import SecurityIcon from "@mui/icons-material/Security";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import { useEffect, useMemo, useState } from "react";
import { posApi } from "../api/posApi";
import { useAppDispatch } from "../app/hooks";
import { showSnackbar } from "../features/ui/uiSlice";

type SourceMode = "upload" | "google" | "service";

type ImportPOSDataModalProps = {
  open: boolean;
  onClose: () => void;
  onImported?: () => Promise<void> | void;
};

type SheetResponse = {
  rows: string[][];
  preview: string[][];
};

const DEFAULT_RANGE = "Sheet1!A1:Z";
const SERVICE_ACCOUNT_EMAIL =
  "retailsync@lively-infinity-488304-m9.iam.gserviceaccount.com";

const buildRowId = (row: string[], index: number) =>
  `${index}-${row.join("||")}`;

const toPreview = (rows: string[][]) => rows.slice(0, 10);

export const ImportPOSDataModal = ({
  open,
  onClose,
  onImported,
}: ImportPOSDataModalProps) => {
  const dispatch = useAppDispatch();
  const googleOauthEnabled =
    import.meta.env.VITE_GOOGLE_OAUTH_ENABLED === "true";
  const googleServiceEnabled =
    import.meta.env.VITE_GOOGLE_SERVICE_ACCOUNT_ENABLED === "true";
  const [mode, setMode] = useState<SourceMode>("upload");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [uploadFile, setUploadFile] = useState<File | null>(null);

  const [googleSpreadsheetId, setGoogleSpreadsheetId] = useState("");
  const [googleRange, setGoogleRange] = useState(DEFAULT_RANGE);
  const [googleRows, setGoogleRows] = useState<string[][]>([]);
  const [googleConnected, setGoogleConnected] = useState(false);

  const [serviceSpreadsheetId, setServiceSpreadsheetId] = useState("");
  const [serviceRange, setServiceRange] = useState(DEFAULT_RANGE);
  const [serviceRows, setServiceRows] = useState<string[][]>([]);

  const [selectedRowIds, setSelectedRowIds] = useState<Record<string, boolean>>(
    {},
  );

  const optionState: Record<SourceMode, { locked: boolean; reason: string }> =
    useMemo(
      () => ({
        upload: {
          locked: !import.meta.env.VITE_API_URL,
          reason: !import.meta.env.VITE_API_URL ? "Missing VITE_API_URL" : "",
        },
        google: {
          locked: !googleOauthEnabled,
          reason:
            "Google OAuth is disabled. Set VITE_GOOGLE_OAUTH_ENABLED=true",
        },
        service: {
          locked: !googleServiceEnabled,
          reason:
            "Service account mode is disabled. Set VITE_GOOGLE_SERVICE_ACCOUNT_ENABLED=true",
        },
      }),
      [googleOauthEnabled, googleServiceEnabled],
    );
  const firstUnlockedMode = useMemo<SourceMode>(() => {
    if (!optionState.upload.locked) return "upload";
    if (!optionState.google.locked) return "google";
    return "service";
  }, [optionState]);

  useEffect(() => {
    if (!optionState[mode].locked) return;
    setMode(firstUnlockedMode);
  }, [firstUnlockedMode, mode, optionState]);

  const clearState = () => {
    setError(null);
    setLoading(false);
    setUploadFile(null);
    setGoogleSpreadsheetId("");
    setGoogleRange(DEFAULT_RANGE);
    setGoogleRows([]);
    setGoogleConnected(false);
    setServiceSpreadsheetId("");
    setServiceRange(DEFAULT_RANGE);
    setServiceRows([]);
    setSelectedRowIds({});
    setMode("upload");
  };

  const handleClose = () => {
    clearState();
    onClose();
  };

  const selectMode = (nextMode: SourceMode) => {
    if (optionState[nextMode].locked) return;
    setMode(nextMode);
  };

  const handleImportFile = async () => {
    if (!uploadFile) {
      setError("Please select a .csv or .xlsx file.");
      return;
    }

    try {
      setLoading(true);
      setError(null);
      await posApi.importFile(uploadFile);
      dispatch(
        showSnackbar({ message: "POS file imported", severity: "success" }),
      );
      await onImported?.();
      handleClose();
    } catch (err: any) {
      const message = err?.response?.data?.message ?? "File import failed";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const handleConnectGoogle = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await posApi.getGoogleConnectUrl();
      const url = (res.data as { data?: { url?: string } }).data?.url;
      if (!url) {
        throw new Error("OAuth URL was not returned by server");
      }
      setGoogleConnected(true);
      window.location.assign(url);
    } catch (err: any) {
      const message =
        err?.response?.data?.message ?? err?.message ?? "Failed to start Google OAuth";
      setError(message);
      setGoogleConnected(false);
    } finally {
      setLoading(false);
    }
  };

  const readSheet = async (
    spreadsheetId: string,
    range: string,
    authMode: "service" | "oauth",
    setRows: (rows: string[][]) => void,
  ) => {
    if (!spreadsheetId.trim()) {
      setError("Spreadsheet ID is required.");
      return;
    }
    if (!range.trim()) {
      setError("Range is required.");
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const res = await posApi.readSheet(
        spreadsheetId.trim(),
        range.trim(),
        authMode,
      );
      const data = res.data.data as SheetResponse;
      setRows(data.rows);
      const ids: Record<string, boolean> = {};
      data.rows.slice(0, 10).forEach((row, index) => {
        ids[buildRowId(row, index)] = index > 0;
      });
      setSelectedRowIds(ids);
      dispatch(
        showSnackbar({ message: "Sheet data loaded", severity: "success" }),
      );
    } catch (err: any) {
      const message =
        err?.response?.data?.message ?? "Failed to read Google Sheet";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const visibleRows = useMemo(() => {
    const sourceRows = mode === "google" ? googleRows : serviceRows;
    return toPreview(sourceRows);
  }, [mode, googleRows, serviceRows]);

  const selectedRowsForImport = useMemo(() => {
    return visibleRows.filter(
      (row, index) => selectedRowIds[buildRowId(row, index)],
    );
  }, [visibleRows, selectedRowIds]);

  const handleImportRows = async () => {
    if (selectedRowsForImport.length === 0) {
      setError("Select at least one row to import.");
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const hasHeader = true;
      const rowsPayload =
        visibleRows.length > 0
          ? [visibleRows[0], ...selectedRowsForImport]
          : selectedRowsForImport;

      await posApi.importRows(rowsPayload, hasHeader);
      dispatch(
        showSnackbar({
          message: "Rows imported successfully",
          severity: "success",
        }),
      );
      await onImported?.();
      handleClose();
    } catch (err: any) {
      const message = err?.response?.data?.message ?? "Row import failed";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const copyServiceEmail = async () => {
    try {
      await navigator.clipboard.writeText(SERVICE_ACCOUNT_EMAIL);
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

  const renderPreviewTable = () => {
    if (visibleRows.length === 0) return null;

    return (
      <Box sx={{ mt: 2 }}>
        <Typography variant="subtitle2" sx={{ mb: 1 }}>
          Preview (first 10 rows)
        </Typography>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Select</TableCell>
              {visibleRows[0].map((cell, idx) => (
                <TableCell key={`header-${idx}`}>
                  {cell || `Column ${idx + 1}`}
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {visibleRows.slice(1).map((row, index) => {
              const rowIndex = index + 1;
              const id = buildRowId(row, rowIndex);
              return (
                <TableRow key={id}>
                  <TableCell padding="checkbox">
                    <Checkbox
                      checked={!!selectedRowIds[id]}
                      onChange={(e) =>
                        setSelectedRowIds((prev) => ({
                          ...prev,
                          [id]: e.target.checked,
                        }))
                      }
                    />
                  </TableCell>
                  {row.map((cell, colIdx) => (
                    <TableCell key={`${id}-${colIdx}`}>{cell}</TableCell>
                  ))}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Box>
    );
  };

  return (
    <Dialog open={open} onClose={handleClose} fullWidth maxWidth="lg">
      <DialogTitle>Import POS Data</DialogTitle>
      <DialogContent dividers>
        <Grid container spacing={2}>
          <Grid size={{ xs: 12, md: 4 }}>
            <Card variant={mode === "upload" ? "elevation" : "outlined"}>
              <CardActionArea
                onClick={() => selectMode("upload")}
                disabled={optionState.upload.locked}
              >
                <CardContent>
                  <Stack spacing={1}>
                    <UploadFileIcon color="primary" />
                    <Typography variant="h6">Upload File</Typography>
                    <Typography variant="body2" color="text.secondary">
                      Import .csv or .xlsx files.
                    </Typography>
                    {optionState.upload.locked && (
                      <Tooltip title={optionState.upload.reason}>
                        <Stack
                          direction="row"
                          spacing={0.5}
                          alignItems="center"
                        >
                          <LockOutlinedIcon color="warning" fontSize="small" />
                          <Typography variant="caption" color="warning.main">
                            Locked: {optionState.upload.reason}
                          </Typography>
                        </Stack>
                      </Tooltip>
                    )}
                  </Stack>
                </CardContent>
              </CardActionArea>
            </Card>
          </Grid>
          <Grid size={{ xs: 12, md: 4 }}>
            <Card variant={mode === "google" ? "elevation" : "outlined"}>
              <CardActionArea
                onClick={() => selectMode("google")}
                disabled={optionState.google.locked}
              >
                <CardContent>
                  <Stack spacing={1}>
                    <LinkIcon color="primary" />
                    <Typography variant="h6">Connect Google</Typography>
                    <Typography variant="body2" color="text.secondary">
                      Use OAuth and fetch spreadsheet data.
                    </Typography>
                    {optionState.google.locked && (
                      <Tooltip title={optionState.google.reason}>
                        <Stack
                          direction="row"
                          spacing={0.5}
                          alignItems="center"
                        >
                          <LockOutlinedIcon color="warning" fontSize="small" />
                          <Typography variant="caption" color="warning.main">
                            Locked: {optionState.google.reason}
                          </Typography>
                        </Stack>
                      </Tooltip>
                    )}
                  </Stack>
                </CardContent>
              </CardActionArea>
            </Card>
          </Grid>
          <Grid size={{ xs: 12, md: 4 }}>
            <Card variant={mode === "service" ? "elevation" : "outlined"}>
              <CardActionArea
                onClick={() => selectMode("service")}
                disabled={optionState.service.locked}
              >
                <CardContent>
                  <Stack spacing={1}>
                    <SecurityIcon color="primary" />
                    <Typography variant="h6">
                      Share With Service Account
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Share sheet with service account and import.
                    </Typography>
                    {optionState.service.locked && (
                      <Tooltip title={optionState.service.reason}>
                        <Stack
                          direction="row"
                          spacing={0.5}
                          alignItems="center"
                        >
                          <LockOutlinedIcon color="warning" fontSize="small" />
                          <Typography variant="caption" color="warning.main">
                            Locked: {optionState.service.reason}
                          </Typography>
                        </Stack>
                      </Tooltip>
                    )}
                  </Stack>
                </CardContent>
              </CardActionArea>
            </Card>
          </Grid>
        </Grid>

        {error && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {error}
          </Alert>
        )}

        {mode === "upload" && !optionState.upload.locked && (
          <Stack spacing={2} sx={{ mt: 2 }}>
            <Button
              component="label"
              variant="contained"
              startIcon={<UploadFileIcon />}
            >
              Select CSV/XLSX
              <input
                hidden
                type="file"
                accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)}
              />
            </Button>
            {uploadFile && (
              <Typography variant="body2">
                Selected file: {uploadFile.name}
              </Typography>
            )}
            <Button
              onClick={handleImportFile}
              variant="contained"
              disabled={!uploadFile || loading}
            >
              Import
            </Button>
          </Stack>
        )}

        {optionState[mode].locked && (
          <Alert severity="warning" sx={{ mt: 2 }}>
            {optionState[mode].reason}
          </Alert>
        )}

        {mode === "google" && !optionState.google.locked && (
          <Stack spacing={2} sx={{ mt: 2 }}>
            <Box>
              <Button variant="outlined" onClick={handleConnectGoogle}>
                Connect Google
              </Button>
              {googleConnected && (
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{ mt: 1 }}
                >
                  After authorization, return here and use Fetch.
                </Typography>
              )}
            </Box>
            <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
              <TextField
                label="Spreadsheet ID"
                value={googleSpreadsheetId}
                onChange={(e) => setGoogleSpreadsheetId(e.target.value)}
                fullWidth
              />
              <TextField
                label="Range"
                value={googleRange}
                onChange={(e) => setGoogleRange(e.target.value)}
                sx={{ minWidth: 220 }}
              />
              <Button
                variant="contained"
                onClick={() =>
                  readSheet(
                    googleSpreadsheetId,
                    googleRange,
                    "oauth",
                    setGoogleRows,
                  )
                }
                disabled={loading}
              >
                Fetch
              </Button>
            </Stack>
            {renderPreviewTable()}
            {visibleRows.length > 1 && (
              <Button
                variant="contained"
                onClick={handleImportRows}
                disabled={loading}
              >
                Import
              </Button>
            )}
          </Stack>
        )}

        {mode === "service" && !optionState.service.locked && (
          <Stack spacing={2} sx={{ mt: 2 }}>
            <Stack direction="row" spacing={1} alignItems="center">
              <TextField
                label="Service Account Email"
                value={SERVICE_ACCOUNT_EMAIL}
                fullWidth
                InputProps={{ readOnly: true }}
              />
              <IconButton
                aria-label="Copy service account email"
                onClick={copyServiceEmail}
              >
                <ContentCopyIcon />
              </IconButton>
            </Stack>
            <Alert severity="info">
              <ol style={{ margin: 0, paddingLeft: 18 }}>
                <li>Open the Google Sheet</li>
                <li>Click Share</li>
                <li>Add the service account email as Viewer/Editor</li>
                <li>Copy Spreadsheet ID from URL</li>
              </ol>
            </Alert>
            <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
              <TextField
                label="Spreadsheet ID"
                value={serviceSpreadsheetId}
                onChange={(e) => setServiceSpreadsheetId(e.target.value)}
                fullWidth
              />
              <TextField
                label="Range"
                value={serviceRange}
                onChange={(e) => setServiceRange(e.target.value)}
                sx={{ minWidth: 220 }}
              />
              <Button
                variant="contained"
                onClick={() =>
                  readSheet(
                    serviceSpreadsheetId,
                    serviceRange,
                    "service",
                    setServiceRows,
                  )
                }
                disabled={loading}
              >
                Test Access
              </Button>
            </Stack>
            {renderPreviewTable()}
            {visibleRows.length > 1 && (
              <Button
                variant="contained"
                onClick={handleImportRows}
                disabled={loading}
              >
                Import
              </Button>
            )}
          </Stack>
        )}
      </DialogContent>
      <DialogActions>
        <FormControlLabel
          control={<Checkbox checked={mode !== "upload"} disabled />}
          label="Rows import requires header row"
          sx={{ mr: "auto", ml: 1 }}
        />
        <Button onClick={handleClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
};
