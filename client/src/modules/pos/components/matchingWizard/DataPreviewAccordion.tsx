import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import { useMemo } from 'react';
import { TARGET_LABELS, type DerivedKey } from './mappingTypes';
import { invertMapping } from './mappingLogic';

type Props = {
  headers: string[];
  sampleRows: string[][];
  mappingByColumn: Record<string, string>;
  enabledDerived: DerivedKey[];
  rowLimit?: number;
};

const asNumber = (value: string | undefined) => {
  const num = Number(String(value ?? '').replace(/,/g, '').trim());
  return Number.isFinite(num) ? num : null;
};

const computeDerivedValue = (
  key: DerivedKey,
  rowByTarget: Record<string, string>,
): string => {
  if (key === 'day') {
    const rawDate = rowByTarget.date;
    if (!rawDate) return '—';
    const date = new Date(rawDate);
    if (Number.isNaN(date.getTime())) return '—';
    return date.toLocaleDateString(undefined, { weekday: 'short' });
  }

  if (key === 'totalSales') {
    const highTax = asNumber(rowByTarget.highTax);
    const lowTax = asNumber(rowByTarget.lowTax);
    if (highTax == null || lowTax == null) return '—';
    return (highTax + lowTax).toFixed(2);
  }

  if (key === 'cashDiff') {
    const totalSales = asNumber(rowByTarget.totalSales);
    const highTax = asNumber(rowByTarget.highTax);
    const lowTax = asNumber(rowByTarget.lowTax);
    const saleTax = asNumber(rowByTarget.saleTax);
    const gas = asNumber(rowByTarget.gas);
    const lottery = asNumber(rowByTarget.lottery);
    const creditCard = asNumber(rowByTarget.creditCard);
    const lotteryPayout = asNumber(rowByTarget.lotteryPayout);
    const sales = totalSales ?? (highTax != null && lowTax != null ? highTax + lowTax : null);
    if (sales == null || saleTax == null || gas == null || lottery == null || creditCard == null || lotteryPayout == null) return '—';
    return (sales + gas + lottery + saleTax - (creditCard + lotteryPayout)).toFixed(2);
  }

  if (key === 'creditPlusLottery') {
    const creditCard = asNumber(rowByTarget.creditCard);
    const lotteryPayout = asNumber(rowByTarget.lotteryPayout);
    if (creditCard == null || lotteryPayout == null) return '—';
    return (creditCard + lotteryPayout).toFixed(2);
  }

  return '—';
};

export const DataPreviewAccordion = ({
  headers,
  sampleRows,
  mappingByColumn,
  enabledDerived,
  rowLimit = 10,
}: Props) => {
  const targetToColumn = useMemo(() => invertMapping(mappingByColumn), [mappingByColumn]);

  const mappedHeaderEntries = useMemo(
    () =>
      headers
        .filter((header) => String(mappingByColumn[header] ?? '').trim().length > 0)
        .map((header) => ({
          header,
          target: String(mappingByColumn[header]),
        })),
    [headers, mappingByColumn],
  );

  const rows = useMemo(() => {
    const limitedRows = sampleRows.slice(0, rowLimit);
    return limitedRows.map((row) => {
      const rowByTarget: Record<string, string> = {};
      for (const [target, header] of Object.entries(targetToColumn)) {
        const headerIndex = headers.indexOf(header);
        rowByTarget[target] = headerIndex >= 0 ? String(row[headerIndex] ?? '') : '';
      }

      return {
        mappedValues: mappedHeaderEntries.map((entry) => {
          const idx = headers.indexOf(entry.header);
          return idx >= 0 ? String(row[idx] ?? '—') : '—';
        }),
        derivedValues: enabledDerived.map((derived) => computeDerivedValue(derived, rowByTarget)),
      };
    });
  }, [enabledDerived, headers, mappedHeaderEntries, rowLimit, sampleRows, targetToColumn]);

  return (
    <Paper variant="outlined">
      <Accordion disableGutters elevation={0} sx={{ '&::before': { display: 'none' } }}>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
            Data Preview (first {rowLimit} rows)
          </Typography>
        </AccordionSummary>
        <AccordionDetails>
          {mappedHeaderEntries.length === 0 && enabledDerived.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              No mapped columns selected yet.
            </Typography>
          ) : (
            <Table size="small">
              <TableHead>
                <TableRow>
                  {mappedHeaderEntries.map((entry) => (
                    <TableCell key={`mapped-${entry.header}`}>
                      <Stack spacing={0.25}>
                        <Typography variant="caption" sx={{ fontWeight: 700 }}>
                          {entry.header}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          Mapped to: {TARGET_LABELS[entry.target as keyof typeof TARGET_LABELS] ?? entry.target}
                        </Typography>
                      </Stack>
                    </TableCell>
                  ))}
                  {enabledDerived.map((derived) => (
                    <TableCell key={`derived-${derived}`}>
                      <Stack spacing={0.25}>
                        <Typography variant="caption" sx={{ fontWeight: 700 }}>
                          {TARGET_LABELS[derived] ?? derived}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          Derived field
                        </Typography>
                      </Stack>
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map((row, index) => (
                  <TableRow key={`preview-row-${index}`}>
                    {row.mappedValues.map((value, mappedIndex) => (
                      <TableCell key={`preview-mapped-${index}-${mappedIndex}`}>{value || '—'}</TableCell>
                    ))}
                    {row.derivedValues.map((value, derivedIndex) => (
                      <TableCell key={`preview-derived-${index}-${derivedIndex}`}>{value || '—'}</TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </AccordionDetails>
      </Accordion>
    </Paper>
  );
};
