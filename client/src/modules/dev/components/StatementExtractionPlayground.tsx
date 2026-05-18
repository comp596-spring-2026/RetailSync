import { startTransition, useRef, useState, type ChangeEvent } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Divider,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography
} from '@mui/material';
import UploadFileOutlinedIcon from '@mui/icons-material/UploadFileOutlined';
import PlayArrowOutlinedIcon from '@mui/icons-material/PlayArrowOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import { accountingApi } from '../../accounting/api';

type BoxShape = {
  left: number;
  top: number;
  width: number;
  height: number;
};

type StatementTransaction = {
  id: string;
  section: string;
  date: string;
  description: string;
  amount: number;
  type: 'credit' | 'debit' | 'check' | 'balance';
  page: number;
  rowText: string;
};

type CheckRow = {
  checkNumber: string;
  date: string;
  amount: number;
  sourcePage: number;
  rowText: string;
};

type CheckCaption = {
  page: number;
  checkNumber: string;
  amount: number;
  text: string;
  bbox: BoxShape;
};

type CheckImage = {
  page: number;
  checkNumber?: string;
  amount?: number;
  imageBox: BoxShape;
  reviewBox: BoxShape;
  imageCropPath: string;
  reviewCropPath: string;
  imageDataUrl: string;
  reviewImageDataUrl: string;
  caption?: CheckCaption;
  alignment: {
    matchedBy: 'checkNumber+amount' | 'nearestCaption' | 'unmatched';
    captionInsideReviewBox: boolean;
    bottomCaptionPadding: number;
    iou?: number;
    status: 'OK' | 'NEEDS_REVIEW' | 'MISSING_CAPTION' | 'MISALIGNED';
  };
};

type ExtractionPage = {
  page: number;
  width: number;
  height: number;
  scale: number;
  imageDataUrl: string;
  boxes: Array<{
    kind: 'image' | 'review' | 'caption';
    label: string;
    box: BoxShape;
    status?: string;
  }>;
};

type CheckProcessResult = {
  checkNumber?: string;
  amount?: number;
  page: number;
  cropBox: BoxShape;
  status: 'ready' | 'needs_review';
  ocrProvider: 'tesseract' | 'pdf_text';
  extractionSource: 'ocr' | 'deterministic' | 'legacy' | 'pdf_text';
  extracted: {
    checkNumber?: string;
    date?: string;
    payeeName?: string;
    amount?: number;
    memo?: string;
  };
  confidence: {
    imageQuality: number;
    ocrConfidence: number;
    fieldConfidence: number;
    crossValidation: number;
    overall: number;
  };
  reasons: string[];
  implementation: {
    cropRendered: boolean;
    ocrProduced: boolean;
    structuredFieldsPresent: boolean;
    mirrorsCheckProcess: boolean;
  };
};

type StatementExtractionPlaygroundResult = {
  fileName: string;
  pageCount: number;
  warnings: string[];
  summary: {
    transactionCount: number;
    sectionCount: number;
    checkRowCount: number;
    detectedCheckImageCount: number;
    matchedCheckImageCount: number;
    unmatchedCheckRowCount: number;
    unmatchedCheckImageCount: number;
    transactionTotal: number;
    checksTableTotal: number;
    matchedCheckImageTotal: number;
    countsMatch: boolean;
    totalsMatch: boolean;
    processedCheckCount: number;
    readyCheckCount: number;
    needsReviewCheckCount: number;
    averageCheckConfidence: number;
  };
  checkProcessSummary: {
    processedCheckCount: number;
    readyCheckCount: number;
    needsReviewCheckCount: number;
    averageConfidence: number;
    ocrProviders: {
      pdfText: number;
      tesseract: number;
    };
    mirrorsImplementation: boolean;
  };
  sectionSummary: Array<{
    section: string;
    count: number;
    total: number;
  }>;
  totalsAnalysis: {
    checksTableCount: number;
    detectedCheckImageCount: number;
    matchedCheckImageCount: number;
    unmatchedCheckRows: string[];
    unmatchedCheckImages: string[];
    checksTableTotal: number;
    matchedCheckImageTotal: number;
    countsMatch: boolean;
    totalsMatch: boolean;
  };
  transactions: StatementTransaction[];
  checks: CheckRow[];
  captions: CheckCaption[];
  checkImages: CheckImage[];
  checkProcessResults: CheckProcessResult[];
  pages: ExtractionPage[];
};

const formatMoney = (value: number | undefined) =>
  typeof value === 'number' && Number.isFinite(value)
    ? value.toLocaleString(undefined, { style: 'currency', currency: 'USD' })
    : '—';

const formatBox = (box: BoxShape | undefined) =>
  box ? `${Math.round(box.left)}, ${Math.round(box.top)}, ${Math.round(box.width)} x ${Math.round(box.height)}` : '—';

const statusColor = (status: string) => {
  if (status === 'OK') return 'success';
  if (status === 'NEEDS_REVIEW') return 'warning';
  return 'error';
};

const checkProcessStatusColor = (status: CheckProcessResult['status']) =>
  status === 'ready' ? 'success' : 'warning';

const OverlayPage = ({ page }: { page: ExtractionPage }) => (
  <Card variant="outlined">
    <CardContent>
      <Stack spacing={1.25}>
        <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
          Page {page.page}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {page.width} x {page.height} px at scale {page.scale}
        </Typography>
        <Box
          sx={{
            position: 'relative',
            width: '100%',
            borderRadius: 2,
            overflow: 'hidden',
            border: '1px solid #dbe4ee',
            backgroundColor: '#f8fafc'
          }}
        >
          <Box component="img" src={page.imageDataUrl} alt={`Page ${page.page}`} sx={{ display: 'block', width: '100%' }} />
          {page.boxes.map((entry, index) => {
            const borderStyle =
              entry.kind === 'review'
                ? '2px dashed #f59e0b'
                : entry.kind === 'caption'
                  ? '2px dotted #2563eb'
                  : '2px solid #16a34a';
            const backgroundColor =
              entry.kind === 'review'
                ? 'rgba(245, 158, 11, 0.08)'
                : entry.kind === 'caption'
                  ? 'rgba(37, 99, 235, 0.08)'
                  : 'rgba(22, 163, 74, 0.1)';
            return (
              <Box
                key={`${entry.kind}-${entry.label}-${index}`}
                sx={{
                  position: 'absolute',
                  left: `${(entry.box.left / page.width) * 100}%`,
                  top: `${(entry.box.top / page.height) * 100}%`,
                  width: `${(entry.box.width / page.width) * 100}%`,
                  height: `${(entry.box.height / page.height) * 100}%`,
                  border: borderStyle,
                  backgroundColor,
                  boxSizing: 'border-box'
                }}
              >
                <Box
                  sx={{
                    position: 'absolute',
                    top: -1,
                    left: -1,
                    px: 0.75,
                    py: 0.25,
                    fontSize: 11,
                    fontWeight: 700,
                    color: '#fff',
                    bgcolor: entry.kind === 'review' ? '#f59e0b' : entry.kind === 'caption' ? '#2563eb' : '#16a34a'
                  }}
                >
                  {entry.label}
                </Box>
              </Box>
            );
          })}
        </Box>
      </Stack>
    </CardContent>
  </Card>
);

export const StatementExtractionPlayground = () => {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<StatementExtractionPlaygroundResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const onFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    setError(null);
    setFile(event.target.files?.[0] ?? null);
  };

  const clearAll = () => {
    setFile(null);
    setResult(null);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const runTest = async () => {
    if (!file) {
      setError('Choose a PDF statement file first.');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const response = await accountingApi.playgroundOfflineExtraction(file);
      startTransition(() => {
        setResult(response.data.data as StatementExtractionPlaygroundResult);
        setFile(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
      });
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Playground extraction failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Stack spacing={2}>
      <Alert severity="info">
        Upload a statement PDF to run the offline extractor in temporary playground mode. This now validates both offline check-image detection and the same per-check extraction service used by the real `check.process` job, without saving statement or GCS artifacts.
      </Alert>

      <Card>
        <CardContent>
          <Stack spacing={1.5}>
            <Typography variant="h6">Offline Statement Test</Typography>
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.25} alignItems={{ xs: 'stretch', md: 'center' }}>
              <Button component="label" variant="contained" startIcon={<UploadFileOutlinedIcon />} disabled={loading}>
                Choose PDF
                <input ref={fileInputRef} hidden type="file" accept="application/pdf,.pdf" onChange={onFileChange} />
              </Button>
              <Typography variant="body2" color="text.secondary" sx={{ flex: 1 }}>
                {file ? file.name : 'No file selected'}
              </Typography>
              <Button
                variant="contained"
                color="success"
                startIcon={loading ? <CircularProgress size={16} color="inherit" /> : <PlayArrowOutlinedIcon />}
                disabled={loading || !file}
                onClick={() => void runTest()}
              >
                {loading ? 'Running…' : 'Run Test'}
              </Button>
              <Button variant="outlined" color="inherit" startIcon={<DeleteOutlineIcon />} onClick={clearAll} disabled={loading && !result}>
                Clear
              </Button>
            </Stack>
            {error && <Alert severity="error">{error}</Alert>}
          </Stack>
        </CardContent>
      </Card>

      {result && (
        <Stack spacing={2}>
          <Card>
            <CardContent>
              <Stack spacing={1.5}>
                <Typography variant="h6">Summary</Typography>
                <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                  <Chip label={`File: ${result.fileName}`} variant="outlined" />
                  <Chip label={`Pages: ${result.pageCount}`} variant="outlined" />
                  <Chip label={`Transactions: ${result.summary.transactionCount}`} color="primary" />
                  <Chip label={`Checks: ${result.summary.checkRowCount}`} color="primary" />
                  <Chip label={`Images: ${result.summary.detectedCheckImageCount}`} color="primary" />
                  <Chip label={`Processed: ${result.summary.processedCheckCount}`} color="primary" variant="outlined" />
                  <Chip label={`Ready: ${result.summary.readyCheckCount}`} color="success" variant="outlined" />
                  <Chip label={`Needs review: ${result.summary.needsReviewCheckCount}`} color="warning" variant="outlined" />
                  <Chip
                    label={`Count Match: ${result.summary.countsMatch ? 'Yes' : 'No'}`}
                    color={result.summary.countsMatch ? 'success' : 'warning'}
                  />
                  <Chip
                    label={`Total Match: ${result.summary.totalsMatch ? 'Yes' : 'No'}`}
                    color={result.summary.totalsMatch ? 'success' : 'warning'}
                  />
                </Stack>
                <TableContainer sx={{ border: '1px solid #e2e8f0', borderRadius: 2 }}>
                  <Table size="small">
                    <TableBody>
                      <TableRow>
                        <TableCell>Transaction total</TableCell>
                        <TableCell>{formatMoney(result.summary.transactionTotal)}</TableCell>
                        <TableCell>Checks cleared total</TableCell>
                        <TableCell>{formatMoney(result.summary.checksTableTotal)}</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell>Matched image total</TableCell>
                        <TableCell>{formatMoney(result.summary.matchedCheckImageTotal)}</TableCell>
                        <TableCell>Matched check images</TableCell>
                        <TableCell>{result.summary.matchedCheckImageCount}</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell>Unmatched check rows</TableCell>
                        <TableCell>{result.summary.unmatchedCheckRowCount}</TableCell>
                        <TableCell>Unmatched images</TableCell>
                        <TableCell>{result.summary.unmatchedCheckImageCount}</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell>Average check confidence</TableCell>
                        <TableCell>{result.summary.averageCheckConfidence.toFixed(2)}</TableCell>
                        <TableCell>Implementation mirror</TableCell>
                        <TableCell>{result.checkProcessSummary.mirrorsImplementation ? 'Yes' : 'No'}</TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </TableContainer>
                {result.warnings.length > 0 && (
                  <Alert severity="warning">
                    {result.warnings.map((warning) => (
                      <Box key={warning}>{warning}</Box>
                    ))}
                  </Alert>
                )}
              </Stack>
            </CardContent>
          </Card>

          <Card>
            <CardContent>
              <Stack spacing={1.25}>
                <Typography variant="h6">Check Process Confirmation</Typography>
                <Alert severity={result.checkProcessSummary.mirrorsImplementation ? 'success' : 'warning'}>
                  Playground checks are running through the same extraction service that powers `check.process`. This view confirms crop rendering, OCR text production, structured field extraction, and ready-vs-review classification without persisting artifacts.
                </Alert>
                <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                  <Chip label={`Processed ${result.checkProcessSummary.processedCheckCount}`} color="primary" />
                  <Chip label={`Ready ${result.checkProcessSummary.readyCheckCount}`} color="success" />
                  <Chip label={`Needs review ${result.checkProcessSummary.needsReviewCheckCount}`} color="warning" />
                  <Chip label={`PDF text OCR ${result.checkProcessSummary.ocrProviders.pdfText}`} variant="outlined" />
                  <Chip label={`Tesseract OCR ${result.checkProcessSummary.ocrProviders.tesseract}`} variant="outlined" />
                </Stack>
                <TableContainer sx={{ border: '1px solid #e2e8f0', borderRadius: 2 }}>
                  <Table size="small">
                    <TableBody>
                      <TableRow>
                        <TableCell>Average confidence</TableCell>
                        <TableCell>{result.checkProcessSummary.averageConfidence.toFixed(2)}</TableCell>
                        <TableCell>Mirrors `check.process` implementation</TableCell>
                        <TableCell>{result.checkProcessSummary.mirrorsImplementation ? 'Yes' : 'No'}</TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </TableContainer>
              </Stack>
            </CardContent>
          </Card>

          <Card>
            <CardContent>
              <Stack spacing={1.25}>
                <Typography variant="h6">Section Analysis</Typography>
                <TableContainer sx={{ maxHeight: 320, border: '1px solid #e2e8f0', borderRadius: 2 }}>
                  <Table stickyHeader size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Section</TableCell>
                        <TableCell align="right">Count</TableCell>
                        <TableCell align="right">Total</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {result.sectionSummary.map((row) => (
                        <TableRow key={row.section}>
                          <TableCell>{row.section}</TableCell>
                          <TableCell align="right">{row.count}</TableCell>
                          <TableCell align="right">{formatMoney(row.total)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Stack>
            </CardContent>
          </Card>

          <Card>
            <CardContent>
              <Stack spacing={1.25}>
                <Typography variant="h6">Matching Analysis</Typography>
                <TableContainer sx={{ border: '1px solid #e2e8f0', borderRadius: 2 }}>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Check table count</TableCell>
                        <TableCell>Detected image count</TableCell>
                        <TableCell>Matched image count</TableCell>
                        <TableCell>Count match</TableCell>
                        <TableCell>Total match</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      <TableRow>
                        <TableCell>{result.totalsAnalysis.checksTableCount}</TableCell>
                        <TableCell>{result.totalsAnalysis.detectedCheckImageCount}</TableCell>
                        <TableCell>{result.totalsAnalysis.matchedCheckImageCount}</TableCell>
                        <TableCell>{result.totalsAnalysis.countsMatch ? 'Yes' : 'No'}</TableCell>
                        <TableCell>{result.totalsAnalysis.totalsMatch ? 'Yes' : 'No'}</TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </TableContainer>
                <Typography variant="body2" color="text.secondary">
                  Unmatched table rows: {result.totalsAnalysis.unmatchedCheckRows.join(', ') || 'None'}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Unmatched images: {result.totalsAnalysis.unmatchedCheckImages.join(', ') || 'None'}
                </Typography>
              </Stack>
            </CardContent>
          </Card>

          <Card>
            <CardContent>
              <Stack spacing={1.25}>
                <Typography variant="h6">Transactions</Typography>
                <TableContainer sx={{ maxHeight: 420, border: '1px solid #e2e8f0', borderRadius: 2 }}>
                  <Table stickyHeader size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Section</TableCell>
                        <TableCell>Date</TableCell>
                        <TableCell>Description</TableCell>
                        <TableCell>Type</TableCell>
                        <TableCell align="right">Amount</TableCell>
                        <TableCell align="right">Page</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {result.transactions.map((row) => (
                        <TableRow key={row.id}>
                          <TableCell>{row.section}</TableCell>
                          <TableCell>{row.date}</TableCell>
                          <TableCell>{row.description}</TableCell>
                          <TableCell>{row.type}</TableCell>
                          <TableCell align="right">{formatMoney(row.amount)}</TableCell>
                          <TableCell align="right">{row.page}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Stack>
            </CardContent>
          </Card>

          <Card>
            <CardContent>
              <Stack spacing={1.25}>
                <Typography variant="h6">Checks Cleared Table</Typography>
                <TableContainer sx={{ maxHeight: 320, border: '1px solid #e2e8f0', borderRadius: 2 }}>
                  <Table stickyHeader size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Check #</TableCell>
                        <TableCell>Date</TableCell>
                        <TableCell align="right">Amount</TableCell>
                        <TableCell align="right">Page</TableCell>
                        <TableCell>Row Text</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {result.checks.map((row) => (
                        <TableRow key={`${row.checkNumber}-${row.sourcePage}-${row.amount}`}>
                          <TableCell>{row.checkNumber}</TableCell>
                          <TableCell>{row.date}</TableCell>
                          <TableCell align="right">{formatMoney(row.amount)}</TableCell>
                          <TableCell align="right">{row.sourcePage}</TableCell>
                          <TableCell>{row.rowText}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Stack>
            </CardContent>
          </Card>

          <Card>
            <CardContent>
              <Stack spacing={1.25}>
                <Typography variant="h6">Check Image Detection</Typography>
                <TableContainer sx={{ maxHeight: 420, border: '1px solid #e2e8f0', borderRadius: 2 }}>
                  <Table stickyHeader size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Check #</TableCell>
                        <TableCell align="right">Page</TableCell>
                        <TableCell align="right">Amount</TableCell>
                        <TableCell>Image Box</TableCell>
                        <TableCell>Review Box</TableCell>
                        <TableCell>Caption</TableCell>
                        <TableCell>Status</TableCell>
                        <TableCell>Preview</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {result.checkImages.map((row, index) => (
                        <TableRow key={`${row.checkNumber ?? 'unmatched'}-${row.page}-${index}`}>
                          <TableCell>{row.checkNumber ? `#${row.checkNumber}` : 'Unmatched'}</TableCell>
                          <TableCell align="right">{row.page}</TableCell>
                          <TableCell align="right">{formatMoney(row.amount)}</TableCell>
                          <TableCell>{formatBox(row.imageBox)}</TableCell>
                          <TableCell>{formatBox(row.reviewBox)}</TableCell>
                          <TableCell>{row.caption?.text ?? '—'}</TableCell>
                          <TableCell>
                            <Stack spacing={0.5}>
                              <Chip
                                size="small"
                                color={statusColor(row.alignment.status)}
                                label={row.alignment.status}
                              />
                              <Typography variant="caption" color="text.secondary">
                                {row.alignment.matchedBy} · pad {Math.round(row.alignment.bottomCaptionPadding)} · iou{' '}
                                {typeof row.alignment.iou === 'number' ? row.alignment.iou.toFixed(2) : '—'}
                              </Typography>
                            </Stack>
                          </TableCell>
                          <TableCell sx={{ minWidth: 220 }}>
                            {row.reviewImageDataUrl ? (
                              <Box
                                component="img"
                                src={row.reviewImageDataUrl}
                                alt={row.checkNumber ? `Check ${row.checkNumber}` : `Check image ${index + 1}`}
                                sx={{ display: 'block', width: 200, borderRadius: 1, border: '1px solid #dbe4ee' }}
                              />
                            ) : (
                              '—'
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Stack>
            </CardContent>
          </Card>

          <Card>
            <CardContent>
              <Stack spacing={1.25}>
                <Typography variant="h6">Per-Check Process Results</Typography>
                <TableContainer sx={{ maxHeight: 460, border: '1px solid #e2e8f0', borderRadius: 2 }}>
                  <Table stickyHeader size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Check #</TableCell>
                        <TableCell align="right">Page</TableCell>
                        <TableCell align="right">Amount</TableCell>
                        <TableCell>Status</TableCell>
                        <TableCell>OCR</TableCell>
                        <TableCell>Source</TableCell>
                        <TableCell align="right">Overall</TableCell>
                        <TableCell>Extracted</TableCell>
                        <TableCell>Implementation</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {result.checkProcessResults.map((row, index) => (
                        <TableRow key={`${row.checkNumber ?? 'check'}-${row.page}-${index}`}>
                          <TableCell>{row.checkNumber ? `#${row.checkNumber}` : 'Unmatched'}</TableCell>
                          <TableCell align="right">{row.page}</TableCell>
                          <TableCell align="right">{formatMoney(row.amount)}</TableCell>
                          <TableCell>
                            <Chip size="small" color={checkProcessStatusColor(row.status)} label={row.status} />
                          </TableCell>
                          <TableCell>{row.ocrProvider}</TableCell>
                          <TableCell>{row.extractionSource}</TableCell>
                          <TableCell align="right">{row.confidence.overall.toFixed(2)}</TableCell>
                          <TableCell sx={{ minWidth: 280 }}>
                            <Typography variant="caption" display="block">
                              Date: {row.extracted.date ?? '—'}
                            </Typography>
                            <Typography variant="caption" display="block">
                              Payee: {row.extracted.payeeName ?? '—'}
                            </Typography>
                            <Typography variant="caption" display="block">
                              Memo: {row.extracted.memo ?? '—'}
                            </Typography>
                            <Typography variant="caption" display="block">
                              Amount: {formatMoney(row.extracted.amount)}
                            </Typography>
                            <Typography variant="caption" color="text.secondary" display="block">
                              {row.reasons.join(' · ')}
                            </Typography>
                          </TableCell>
                          <TableCell sx={{ minWidth: 220 }}>
                            <Typography variant="caption" display="block">
                              Crop rendered: {row.implementation.cropRendered ? 'Yes' : 'No'}
                            </Typography>
                            <Typography variant="caption" display="block">
                              OCR produced: {row.implementation.ocrProduced ? 'Yes' : 'No'}
                            </Typography>
                            <Typography variant="caption" display="block">
                              Structured fields present: {row.implementation.structuredFieldsPresent ? 'Yes' : 'No'}
                            </Typography>
                            <Typography variant="caption" display="block">
                              Real job mirror: {row.implementation.mirrorsCheckProcess ? 'Yes' : 'No'}
                            </Typography>
                            <Typography variant="caption" color="text.secondary" display="block">
                              Crop box: {formatBox(row.cropBox)}
                            </Typography>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Stack>
            </CardContent>
          </Card>

          <Card>
            <CardContent>
              <Stack spacing={1.25}>
                <Typography variant="h6">Caption Extraction</Typography>
                <TableContainer sx={{ maxHeight: 320, border: '1px solid #e2e8f0', borderRadius: 2 }}>
                  <Table stickyHeader size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Check #</TableCell>
                        <TableCell align="right">Page</TableCell>
                        <TableCell align="right">Amount</TableCell>
                        <TableCell>Text</TableCell>
                        <TableCell>Box</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {result.captions.map((row, index) => (
                        <TableRow key={`${row.checkNumber}-${row.page}-${index}`}>
                          <TableCell>{row.checkNumber}</TableCell>
                          <TableCell align="right">{row.page}</TableCell>
                          <TableCell align="right">{formatMoney(row.amount)}</TableCell>
                          <TableCell>{row.text}</TableCell>
                          <TableCell>{formatBox(row.bbox)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Stack>
            </CardContent>
          </Card>

          <Divider />

          <Stack spacing={1.25}>
            <Typography variant="h6">Page Overlays</Typography>
            {result.pages.length === 0 && (
              <Alert severity="warning">No rendered check-image pages were produced for this file.</Alert>
            )}
            <Stack spacing={2}>
              {result.pages.map((page) => (
                <OverlayPage key={page.page} page={page} />
              ))}
            </Stack>
          </Stack>
        </Stack>
      )}
    </Stack>
  );
};
