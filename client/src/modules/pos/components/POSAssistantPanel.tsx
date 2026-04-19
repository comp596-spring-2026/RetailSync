import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import BoltIcon from '@mui/icons-material/Bolt';
import SendRoundedIcon from '@mui/icons-material/SendRounded';
import TableChartIcon from '@mui/icons-material/TableChart';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Grid2 as Grid,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography
} from '@mui/material';
import ReactApexChart from 'react-apexcharts';
import { useEffect, useMemo, useRef, useState } from 'react';
import { LoadingEmptyStateWrapper } from '../../../components';
import { posApi, type PosAiChatResponse } from '../api';
import type { PosPrimaryAction } from '../pages/types';
import type { PosState } from '../state';

type PosAiSnapshot = {
  records: PosState['records'];
  dateRange: PosState['dateRange'];
  totals: PosState['totals'];
  kpis: PosState['kpis'];
  chartsData: PosState['chartsData'];
  alerts: PosState['alerts'];
};

type POSAssistantPanelProps = {
  loading: boolean;
  snapshot: PosAiSnapshot;
  primaryAction: PosPrimaryAction;
};

type PosAiWidget = PosAiChatResponse['widgets'][number];

type WidgetRecord = Record<string, unknown>;

type TableColumn = {
  key: string;
  label: string;
  align: 'left' | 'right';
};

type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  response?: PosAiChatResponse;
};

const SAMPLE_PROMPTS = [
  'Which day is the highest selling?',
  'Compare cash performance to card sales.',
  'Compare weekday vs weekend sales.',
  'Show the top sales days.',
  'What changed most in this period?'
];

const formatCurrency = (value: number) =>
  value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const normalizeText = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

const isRecord = (value: unknown): value is WidgetRecord =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const asRecordArray = (value: unknown): WidgetRecord[] => {
  if (!Array.isArray(value)) return [];
  return value.filter(isRecord);
};

const toOptionPrompt = (option: { nextPrompt?: string; promptPatch?: string; label: string }) =>
  option.nextPrompt ?? option.promptPatch ?? option.label;

const toneToColor = (tone: unknown): 'default' | 'success' | 'warning' | 'error' | 'info' => {
  switch (String(tone)) {
    case 'positive':
    case 'success':
      return 'success';
    case 'warning':
      return 'warning';
    case 'critical':
    case 'danger':
      return 'error';
    case 'info':
      return 'info';
    default:
      return 'default';
  }
};

const inferScope = (prompt: string): 'overview' | 'comparison' | 'trend' | 'weekday' | 'top_days' => {
  const normalized = prompt.trim().toLowerCase();
  if (/(weekday|weekend|day of week)/.test(normalized)) return 'weekday';
  if (/(trend|spike|dip|moving average)/.test(normalized)) return 'trend';
  if (/(highest|best|top|strongest|weakest)/.test(normalized)) return 'top_days';
  if (/(compare|versus|vs\b)/.test(normalized)) return 'comparison';
  return 'overview';
};

const resolveClarificationQuestion = (response: PosAiChatResponse) =>
  normalizeText(
    response.clarificationQuestion ??
      response.clarifyingQuestion ??
      response.clarification?.question ??
      ''
  );

const resolveClarificationOptions = (response: PosAiChatResponse) => {
  const rawOptions = response.clarificationOptions ?? response.clarification?.options ?? [];

  const resolved = rawOptions
    .map((option) => {
      if (typeof option === 'string') {
        return { label: option, nextPrompt: option, promptPatch: option, value: option, kind: 'custom' as const };
      }
      return option;
    })
    .filter((option) => normalizeText(option.label).length > 0);

  if (resolved.length > 0) return resolved;

  const wantsYesNo =
    Boolean(response.clarification?.yesNo) ||
    Boolean(response.clarification?.allowYesNo) ||
    Boolean(response.clarificationYesNo) ||
    Boolean(response.clarificationRequired) ||
    Boolean(response.needsClarification);

  if (!wantsYesNo) return [];

  return [
    { label: 'Yes', value: 'yes', kind: 'yes_no' as const, nextPrompt: 'Yes' },
    { label: 'No', value: 'no', kind: 'yes_no' as const, nextPrompt: 'No' }
  ];
};

const widgetColumns = (widget: Extract<PosAiWidget, { type: 'comparison_table' }>): TableColumn[] =>
  widget.columns.map((column) => ({
    key: column.key,
    label: column.label,
    align: column.format === 'currency' || column.format === 'number' || column.format === 'percent' ? 'right' : 'left'
  }));

const renderCellValue = (
  value: string | number | boolean | null | undefined,
  format: 'currency' | 'number' | 'percent' | 'text'
) => {
  if (value === null || typeof value === 'undefined') return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'number') {
    if (format === 'currency') return `$${formatCurrency(value)}`;
    if (format === 'percent') return `${value.toFixed(1)}%`;
    if (format === 'number') return value.toLocaleString('en-US');
  }
  return String(value);
};

const WidgetMetricCard = ({ widget }: { widget: Extract<PosAiWidget, { type: 'metric_card' }> }) => (
  <Card variant="outlined" sx={{ borderRadius: 3, height: '100%' }}>
    <CardContent>
      <Stack spacing={1}>
        <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={1}>
          <Typography variant="overline" sx={{ letterSpacing: 1.1 }}>
            {widget.title}
          </Typography>
          <Chip size="small" color={toneToColor(widget.tone)} label={widget.key.replaceAll('_', ' ')} />
        </Stack>
        <Typography variant="h5" fontWeight={900}>
          {widget.value}
        </Typography>
        {widget.subtitle ? (
          <Typography variant="body2" color="text.secondary">
            {widget.subtitle}
          </Typography>
        ) : null}
      </Stack>
    </CardContent>
  </Card>
);

const WidgetInsightCard = ({ widget }: { widget: Extract<PosAiWidget, { type: 'text_insight' }> }) => (
  <Card variant="outlined" sx={{ borderRadius: 3, height: '100%' }}>
    <CardContent>
      <Stack spacing={1.25}>
        <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={1}>
          <Typography variant="subtitle1" fontWeight={900}>
            {widget.title}
          </Typography>
          {widget.severity ? <Chip size="small" label={widget.severity} color="primary" /> : null}
        </Stack>
        <Typography variant="body2" color="text.secondary">
          {widget.text}
        </Typography>
      </Stack>
    </CardContent>
  </Card>
);

const WidgetTableCard = ({ widget }: { widget: Extract<PosAiWidget, { type: 'comparison_table' }> }) => {
  const columns = widgetColumns(widget);
  return (
    <Card variant="outlined" sx={{ borderRadius: 3, height: '100%' }}>
      <CardContent>
        <Stack spacing={1.25}>
          <Box>
            <Typography variant="subtitle1" fontWeight={900}>
              {widget.title}
            </Typography>
            {widget.note ? (
              <Typography variant="body2" color="text.secondary">
                {widget.note}
              </Typography>
            ) : null}
          </Box>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  {columns.map((column) => (
                    <TableCell key={column.key} align={column.align} sx={{ fontWeight: 800 }}>
                      {column.label}
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {widget.rows.map((row, index) => (
                  <TableRow key={`${widget.key}-${index}`}>
                    {widget.columns.map((column) => (
                      <TableCell key={column.key} align={column.format === 'text' ? 'left' : 'right'}>
                        {renderCellValue(row[column.key], column.format)}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Stack>
      </CardContent>
    </Card>
  );
};

const WidgetChartCard = ({ widget }: { widget: Extract<PosAiWidget, { type: 'bar_chart' | 'line_chart' }> }) => {
  const data = asRecordArray(widget.data);
  const categories = data.map((entry) => String(entry[widget.xKey] ?? ''));
  const values = data.map((entry) => Number(entry[widget.yKey] ?? 0));

  return (
    <Card variant="outlined" sx={{ borderRadius: 3, height: '100%' }}>
      <CardContent>
        <Stack spacing={1.25}>
          <Box>
            <Typography variant="subtitle1" fontWeight={900}>
              {widget.title}
            </Typography>
            {widget.note ? (
              <Typography variant="body2" color="text.secondary">
                {widget.note}
              </Typography>
            ) : null}
          </Box>
          <Box role="img" aria-label={widget.title}>
            <ReactApexChart
              type={widget.type === 'bar_chart' ? 'bar' : 'line'}
              series={[
                {
                  name: widget.title,
                  data:
                    widget.type === 'bar_chart'
                      ? values
                      : values.map((value, index) => ({
                          x: categories[index] ?? String(index + 1),
                          y: value
                        }))
                }
              ] as never}
              options={{
                chart: {
                  toolbar: { show: true },
                  zoom: { enabled: false }
                },
                dataLabels: { enabled: false },
                stroke: { curve: 'smooth', width: 3 },
                plotOptions: { bar: { borderRadius: 8, columnWidth: '58%' } },
                colors: [widget.type === 'bar_chart' ? '#0f766e' : '#1d4ed8'],
                xaxis: { categories },
                yaxis: {
                  labels: {
                    formatter: (value: number) => `$${formatCurrency(Number(value ?? 0))}`
                  }
                },
                tooltip: {
                  y: {
                    formatter: (value: number) => `$${formatCurrency(Number(value ?? 0))}`
                  }
                }
              } as never}
              height={260}
            />
          </Box>
        </Stack>
      </CardContent>
    </Card>
  );
};

const AssistantAttachments = ({
  response,
  onPromptSelect
}: {
  response: PosAiChatResponse;
  onPromptSelect: (prompt: string) => void;
}) => {
  const widgets = response.widgets ?? [];
  const followUps = response.followUps ?? [];
  const clarificationQuestion = resolveClarificationQuestion(response);
  const clarificationOptions = resolveClarificationOptions(response);

  return (
    <Stack spacing={1.25} sx={{ mt: 1.25 }}>
      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
        <Chip size="small" label={response.aiStatus.source} />
        <Chip size="small" label={response.aiStatus.providerStatus} color={response.aiStatus.providerStatus === 'healthy' ? 'success' : 'warning'} />
        <Chip size="small" label={`Confidence ${Math.round(response.aiStatus.confidence * 100)}%`} />
      </Stack>

      {response.needsClarification && clarificationQuestion ? (
        <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 2.5, bgcolor: 'background.default' }}>
          <Stack spacing={1.25}>
            <Typography variant="subtitle2" fontWeight={800}>
              {clarificationQuestion}
            </Typography>
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              {clarificationOptions.map((option) => (
                <Chip
                  key={`${option.kind}-${option.value}`}
                  label={option.label}
                  onClick={() => onPromptSelect(toOptionPrompt(option))}
                  color="primary"
                  variant="outlined"
                />
              ))}
            </Stack>
          </Stack>
        </Paper>
      ) : null}

      {widgets.length > 0 ? (
        <Grid container spacing={1.25}>
          {widgets.map((widget, index) => {
            switch (widget.type) {
              case 'metric_card':
                return (
                  <Grid key={`${widget.key}-${index}`} size={{ xs: 12, sm: 6, lg: 3 }}>
                    <WidgetMetricCard widget={widget} />
                  </Grid>
                );
              case 'text_insight':
                return (
                  <Grid key={`${widget.key}-${index}`} size={{ xs: 12, lg: 6 }}>
                    <WidgetInsightCard widget={widget} />
                  </Grid>
                );
              case 'comparison_table':
                return (
                  <Grid key={`${widget.key}-${index}`} size={{ xs: 12 }}>
                    <WidgetTableCard widget={widget} />
                  </Grid>
                );
              case 'bar_chart':
              case 'line_chart':
                return (
                  <Grid key={`${widget.key}-${index}`} size={{ xs: 12, lg: 6 }}>
                    <WidgetChartCard widget={widget} />
                  </Grid>
                );
              default:
                return null;
            }
          })}
        </Grid>
      ) : null}

      {!response.needsClarification && followUps.length > 0 ? (
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
          {followUps.map((prompt) => (
            <Chip
              key={prompt}
              label={prompt}
              onClick={() => onPromptSelect(prompt)}
              variant="outlined"
              icon={<TableChartIcon />}
            />
          ))}
        </Stack>
      ) : null}
    </Stack>
  );
};

export const POSAssistantPanel = ({ loading, snapshot, primaryAction }: POSAssistantPanelProps) => {
  const [draftPrompt, setDraftPrompt] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [queryLoading, setQueryLoading] = useState(false);
  const [queryError, setQueryError] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  useEffect(() => {
    setMessages([]);
    setDraftPrompt('');
    setQueryError(null);
    setQueryLoading(false);
    requestIdRef.current += 1;
  }, [snapshot.dateRange.from, snapshot.dateRange.to]);

  const isEmpty = snapshot.records.length === 0;
  const primaryAlert = snapshot.alerts[0] ?? null;
  const alertSummary = primaryAlert
    ? primaryAlert.message
    : 'No major anomalies detected across the selected range.';
  const alertTone: 'success' | 'warning' | 'error' | 'info' = primaryAlert
    ? primaryAlert.severity === 'high'
      ? 'error'
      : primaryAlert.severity === 'medium'
        ? 'warning'
        : 'info'
    : 'success';

  const contextMetrics = useMemo(
    () => [
      { label: 'Rows', value: String(snapshot.records.length) },
      { label: 'Sales', value: `$${formatCurrency(snapshot.kpis.totalSales)}` },
      { label: 'Cash diff', value: `$${formatCurrency(snapshot.kpis.cashDiff)}` },
      { label: 'Alerts', value: String(snapshot.alerts.length) }
    ],
    [snapshot.alerts.length, snapshot.kpis.cashDiff, snapshot.kpis.totalSales, snapshot.records.length]
  );

  const runPrompt = async (prompt: string) => {
    const nextPrompt = prompt.trim();
    if (!nextPrompt) return;

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}-${requestIdRef.current}`,
      role: 'user',
      text: nextPrompt
    };

    setMessages((current) => [...current, userMessage]);
    setDraftPrompt('');
    setQueryLoading(true);
    setQueryError(null);

    const requestId = ++requestIdRef.current;

    try {
      const result = await posApi.aiQuery({
        prompt: nextPrompt,
        start: snapshot.dateRange.from,
        end: snapshot.dateRange.to,
        scope: inferScope(nextPrompt),
        filters: {},
        widgetLimit: 4,
        insightLimit: 4
      });

      if (requestId !== requestIdRef.current) return;

      const response = result.data.data;
      setMessages((current) => [
        ...current,
        {
          id: `assistant-${Date.now()}-${requestId}`,
          role: 'assistant',
          text: response.assistantMessage || response.directAnswer || response.answer || response.summary,
          response
        }
      ]);
    } catch (error) {
      if (requestId !== requestIdRef.current) return;
      const message =
        (error as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'Failed to load POS AI response';
      setQueryError(message);
    } finally {
      if (requestId === requestIdRef.current) {
        setQueryLoading(false);
      }
    }
  };

  const starterMessage =
    'Ask me something simple about this POS range. If your request is vague, I’ll ask a quick follow-up and give you chips to choose from.';

  return (
    <LoadingEmptyStateWrapper
      loading={loading}
      empty={!loading && isEmpty}
      loadingLabel="Loading POS AI..."
      emptyMessage="No POS data for this date range"
      emptySecondary="Sync or import POS data, then return to the AI tab for guided insights."
      emptyActionLabel={primaryAction.label}
      onEmptyAction={primaryAction.onClick}
    >
      <Stack spacing={2}>
        <Paper variant="outlined" sx={{ p: 2, borderRadius: 3 }}>
          <Stack spacing={1.5}>
            <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
              <Chip icon={<AutoAwesomeIcon />} label="POS AI" color="primary" />
              <Chip label={`${snapshot.dateRange.from} to ${snapshot.dateRange.to}`} variant="outlined" />
              <Chip icon={<BoltIcon />} label={`${snapshot.alerts.length} alerts`} variant="outlined" />
            </Stack>
            <Alert severity={alertTone} variant="outlined" sx={{ alignItems: 'flex-start' }}>
              <Stack spacing={0.5}>
                <Typography variant="subtitle1" fontWeight={900}>
                  {primaryAlert ? 'Primary anomaly' : 'Stable range'}
                </Typography>
                <Typography variant="body2">{alertSummary}</Typography>
                {primaryAlert ? (
                  <Typography variant="caption" color="text.secondary">
                    Source: {primaryAlert.type.replaceAll('_', ' ')} · Severity: {primaryAlert.severity}
                  </Typography>
                ) : null}
              </Stack>
            </Alert>
            <Typography variant="h6" fontWeight={900}>
              Ask plain-language POS questions and get a normal assistant-style response.
            </Typography>
            <Grid container spacing={1}>
              {contextMetrics.map((metric) => (
                <Grid key={metric.label} size={{ xs: 6, sm: 3 }}>
                  <Paper variant="outlined" sx={{ p: 1.25, borderRadius: 2 }}>
                    <Typography variant="caption" color="text.secondary">
                      {metric.label}
                    </Typography>
                    <Typography variant="subtitle1" fontWeight={800}>
                      {metric.value}
                    </Typography>
                  </Paper>
                </Grid>
              ))}
            </Grid>
          </Stack>
        </Paper>

        <Paper variant="outlined" sx={{ borderRadius: 3, overflow: 'hidden' }}>
          <Stack spacing={0} sx={{ minHeight: 420 }}>
            <Box sx={{ p: 2, borderBottom: '1px solid', borderColor: 'divider', bgcolor: 'background.default' }}>
              <Typography variant="subtitle2" fontWeight={800}>
                Conversation
              </Typography>
            </Box>

            <Stack spacing={2} sx={{ p: 2, flex: 1 }}>
              {messages.length === 0 ? (
                <Paper variant="outlined" sx={{ p: 2, borderRadius: 3, maxWidth: 760 }}>
                  <Stack spacing={1.5}>
                    <Typography variant="subtitle1" fontWeight={900}>
                      RetailSync Assistant
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {starterMessage}
                    </Typography>
                    <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                      {SAMPLE_PROMPTS.map((prompt) => (
                        <Chip
                          key={prompt}
                          label={prompt}
                          onClick={() => void runPrompt(prompt)}
                          variant="outlined"
                          icon={<TableChartIcon />}
                        />
                      ))}
                    </Stack>
                  </Stack>
                </Paper>
              ) : null}

              {messages.map((message) => {
                const isAssistant = message.role === 'assistant';
                return (
                  <Stack
                    key={message.id}
                    alignItems={isAssistant ? 'flex-start' : 'flex-end'}
                    spacing={1}
                  >
                    <Paper
                      variant="outlined"
                      sx={{
                        p: 1.5,
                        borderRadius: 3,
                        maxWidth: { xs: '100%', md: '78%' },
                        bgcolor: isAssistant ? 'background.paper' : 'primary.main',
                        color: isAssistant ? 'text.primary' : 'primary.contrastText'
                      }}
                    >
                      <Stack spacing={1}>
                        <Typography variant="caption" sx={{ opacity: 0.75 }}>
                          {isAssistant ? 'Assistant' : 'You'}
                        </Typography>
                        <Typography variant="body1">{message.text}</Typography>
                      </Stack>
                    </Paper>

                    {isAssistant && message.response ? (
                      <Box sx={{ width: '100%', maxWidth: { xs: '100%', md: '88%' } }}>
                        <AssistantAttachments response={message.response} onPromptSelect={(prompt) => void runPrompt(prompt)} />
                      </Box>
                    ) : null}
                  </Stack>
                );
              })}

              {queryLoading ? (
                <Stack alignItems="flex-start">
                  <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 3, maxWidth: 320 }}>
                    <Typography variant="body2" color="text.secondary">
                      Thinking through your POS data...
                    </Typography>
                  </Paper>
                </Stack>
              ) : null}

              {queryError ? <Alert severity="error">{queryError}</Alert> : null}
            </Stack>

            <Box sx={{ p: 2, borderTop: '1px solid', borderColor: 'divider' }}>
              <Stack spacing={1.25}>
                <TextField
                  fullWidth
                  multiline
                  minRows={2}
                  maxRows={5}
                  label="Ask the POS"
                  placeholder="Which day is the highest selling? Compare cash to card. Show top sales days."
                  value={draftPrompt}
                  onChange={(event) => setDraftPrompt(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault();
                      void runPrompt(draftPrompt);
                    }
                  }}
                />
                <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={1} flexWrap="wrap">
                  <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                    {SAMPLE_PROMPTS.slice(0, 3).map((prompt) => (
                      <Chip
                        key={prompt}
                        size="small"
                        label={prompt}
                        onClick={() => void runPrompt(prompt)}
                        variant="outlined"
                      />
                    ))}
                  </Stack>
                  <Button
                    variant="contained"
                    endIcon={<SendRoundedIcon />}
                    onClick={() => void runPrompt(draftPrompt)}
                    disabled={queryLoading || !draftPrompt.trim()}
                  >
                    Send
                  </Button>
                </Stack>
              </Stack>
            </Box>
          </Stack>
        </Paper>
      </Stack>
    </LoadingEmptyStateWrapper>
  );
};
